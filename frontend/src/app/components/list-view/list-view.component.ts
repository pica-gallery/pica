import {
  type AfterViewInit,
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  ElementRef,
  EnvironmentInjector,
  EventEmitter,
  inject,
  Input,
  NgZone,
  numberAttribute,
  type OnChanges,
  type OnDestroy,
  type SimpleChanges,
  type Type,
  ViewChild
} from '@angular/core';
import {observeElementSize} from '../../util';
import {distinctUntilChanged, filter, map, Subscription} from 'rxjs';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {type DetachedChild, ViewRecycler} from './view-recycler';

export type ListItem = {
  component: Type<unknown>,
  inputs?: Record<string, unknown>,
  outputs?: Record<string, (value: any) => void>,
}

type Child = {
  node: HTMLElement,
  ref: ComponentRef<unknown>,
  index: number,
  top: number,
  height: number,
  subscription: Subscription | null,
}

function debug(...args: any[]) {
  console.debug(...args);
}

function removeInplace(children: Child[], child: Child) {
  const idx = children.findIndex(ch => ch === child);
  if (idx >= 0) {
    children.splice(idx, 1);
  }
}

@Component({
  selector: 'app-list-view',
  standalone: true,
  imports: [],
  templateUrl: './list-view.component.html',
  styleUrl: './list-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ListViewComponent implements AfterViewInit, OnChanges, OnDestroy {
  private readonly applicationRef = inject(ApplicationRef);
  private readonly ngZone = inject(NgZone);

  private readonly root: ElementRef<HTMLElement> = inject(ElementRef);

  @ViewChild('Canvas')
  protected canvas!: ElementRef<HTMLElement>;

  protected lastRootHeight = 0;
  protected readonly children: Child[] = [];

  private readonly observer = new ResizeObserver(entries => this.resizeObserverCallback(entries));
  private readonly recycler = new ViewRecycler(inject(EnvironmentInjector));

  private canvasHeight: number = 0;

  @Input({required: true})
  public items!: ListItem[]

  @Input({transform: numberAttribute})
  public initialIndex: number | null = null;

  /**
   * Number of pixels to fill above and below the visible area.
   */
  @Input({transform: numberAttribute})
  public bufferSize: number = 256;

  /**
   * Maximum number of children to layout in one go
   */
  @Input({transform: numberAttribute})
  public maxChildrenToLayout: number = 64;

  /**
   * Number of detached views to store per component.
   */
  @Input({transform: numberAttribute})
  public perComponentCacheSize: number = 10;

  constructor() {
    this.offsetY = 0;

    observeElementSize(this.root.nativeElement)
      .pipe(
        map(sizes => sizes.height),
        filter(height => height > 0),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe(height => this.updateContent(height));
  }

  protected get offsetY(): number {
    return this.root.nativeElement.scrollTop;
  }

  protected set offsetY(value: number) {
    this.root.nativeElement.scrollTop = value;
  }

  ngAfterViewInit() {
    // ensure we're scrolled to the top
    this.offsetY = 0;

    this.ngZone.runOutsideAngular(() => {
      this.root.nativeElement.addEventListener('scroll', () => this.updateContent());
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    debug('Changes', changes);

    // forward config to the recycler
    this.recycler.perComponentCacheSize = this.perComponentCacheSize;

    const change = changes['items'];
    if (!change || change.firstChange) {
      return;
    }

    const items = change.currentValue as ListItem[];

    for (const child of [...this.children]) {
      const item = items[child.index];

      // child is not compatible or not needed anymore, remove it now
      if (item == null || item.component !== child.ref.componentType) {
        debug('Need to get rid of child at', child.index);
        this.recycleChild(child);
        continue;
      }

      // child is compatible, update input and outputs now
      debug('Can rebind child at ', child.index);
      this.bindInputsOutputs(child, item);
    }

    this.updateContent();
  }

  ngOnDestroy(): void {
    this.observer.disconnect();

    // destroy the cached nodes. We do not need to destroy
    // the attached nodes, as they are getting cleaned up by angular.
    this.recycler.destroyAll();
  }

  protected updateContent(height: number = this.lastRootHeight) {
    const now = performance.now();
    this._updateContent(height);

    const duration = performance.now() - now;
    if (duration >= 16) {
      debug('[slow] updateContent() took %sms', duration.toFixed(2));
    }
  }

  private _updateContent(height: number = this.lastRootHeight) {
    // debug('updateContent()')
    this.lastRootHeight = height;

    // we might need to reset scrolling if we have no anchor to work with
    this.resetScrolling();

    // find the child we want to anchor all the views to
    const anchorChild = this.anchorChild();

    // start layout at the anchor
    let nextTop = anchorChild?.top ?? 0;

    // and layout the anchor first
    const indexStart = anchorChild?.index ?? this.initialIndex ?? 0;

    const childrenToKeep = new Set();

    // fill elements starting at the first one to show
    for (let index = indexStart; index < this.items.length; index++) {
      const child = this.getChild(index);

      // keep this child
      childrenToKeep.add(child);

      this.layoutChild(child, nextTop)
      nextTop += child.height;

      if (nextTop > this.offsetY + height + this.bufferSize || childrenToKeep.size >= this.maxChildrenToLayout) {
        break;
      }
    }

    let previousTop = anchorChild?.top ?? 0;

    // go backwards starting at the child before the anchor
    for (let index = indexStart - 1; index >= 0; index--) {
      const child = this.getChild(index);

      // keep this child
      childrenToKeep.add(child);

      this.layoutChild(child, previousTop - child.height)
      previousTop -= child.height;

      if (previousTop < this.offsetY - this.bufferSize || childrenToKeep.size >= this.maxChildrenToLayout) {
        break;
      }
    }

    for (const child of [...this.children]) {
      if (!childrenToKeep.has(child)) {
        this.recycleChild(child);
      }
    }

    // ensure children are sorted by their y position
    this.children.sort((lhs, rhs) => lhs.top - rhs.top);

    this.fixScrollOverflow();

    // calculate new height for the canvas based on the now layouted children
    this.updateCanvasSize();
  }

  private layoutChild(child: Child, top: number) {
    if (child.top != top) {
      child.top = top;
      child.node.style.top = top + 'px';
    }
  }

  private findChild(index: number): Child | null {
    return this.children.find(child => child.index === index) ?? null;
  }

  private resetScrolling() {
    if (!this.children.length) {
      this.offsetY = 0;
    }

    // it looks like someone scrolled so fast that no child is visible
    // anymore. In this case we just reset scrolling.
    const hasVisibleChildren = this.children.some(child => {
      return this.childIntersectsViewport(child)
    });

    if (!hasVisibleChildren) {
      this.offsetY = this.children[0]?.top ?? 0;
    }
  }

  private childIntersectsViewport(child: Child): boolean {
    return child.top + child.height > this.offsetY
      && child.top < this.offsetY + this.lastRootHeight
  }

  private anchorChild(): Child | null {
    return this.children.find(child => child.top >= this.offsetY) ?? null;
  }

  private fixScrollOverflow() {
    // fix scroll offset if we've layouted children to the outside of the scroll container.
    const firstChild = this.children.find(child => child.top);
    if (firstChild != null) {
      if (firstChild.index === 0 && firstChild.top > 0) {
        debug('Anchor not at zero, fixing this now.');

        const removedSpace = firstChild.top;
        this.offsetChildrenKeepScroll(removedSpace);

      } else if (firstChild.top < 0) {
        // if we have layouted some content "before" the container, we need to correct all children
        // again to move them out of the container area. We also need to offset the current scroll
        // by the same amount.
        const newSpace = -firstChild.top;

        debug('Put children outside of container, adjust offset+scroll by', newSpace);
        this.offsetChildrenKeepScroll(newSpace)
      }
    }
  }

  private updateCanvasSize() {
    if (this.children.length === 0) {
      this.canvas.nativeElement.style.height = '200%';
      return;
    }

    const lastChild = this.children[this.children.length - 1];

    if (lastChild != null) {
      if (lastChild.index === this.items.length - 1) {
        // actually the last one
        this.canvasHeight = lastChild.top + lastChild.height;
      } else {
        // estimate on how many more rows we might need to add
        const extraSpace = 100 * (this.items.length - lastChild.index + 1);
        this.canvasHeight = Math.max(this.canvasHeight, lastChild.top + lastChild.height + extraSpace);
      }
    }

    this.canvas.nativeElement.style.height = this.canvasHeight + 'px';
  }

  private attachChild(detachedChild: DetachedChild, idx: number, item: ListItem): Child {
    const child: Child = {
      node: detachedChild.node,
      ref: detachedChild.ref,
      top: Number.NaN,
      height: 0,
      index: idx,
      subscription: null,
    }

    child.node.append(child.ref.location.nativeElement);
    child.node.dataset['index'] = child.index.toString();

    // check for the next child so we can insert this one before
    const next = this.findChild(child.index + 1);
    this.canvas.nativeElement.insertBefore(child.node, next?.node ?? null);

    this.applicationRef.attachView(child.ref.hostView);
    this.observer.observe(child.node, {box: 'border-box'});
    this.children.push(child);

    // bind inputs and run change detection to be able to correctly measure the
    // view in the next step.
    this.bindInputsOutputs(child, item);
    child.ref.changeDetectorRef.detectChanges()

    // measure child
    child.height = child.node.offsetHeight;

    return child;
  }

  private detachChild(child: Child): DetachedChild {
    // debug('Detaching child', child.index);
    removeInplace(this.children, child);

    child.subscription?.unsubscribe()

    this.observer.unobserve(child.node);
    this.applicationRef.detachView(child.ref.hostView);
    this.canvas.nativeElement.removeChild(child.node);

    // measure child now
    child.height = child.node.offsetHeight;

    return {
      node: child.node,
      ref: child.ref,
    }
  }

  private resizeObserverCallback(entries: ResizeObserverEntry[]) {
    let hasChanges = false;

    for (const entry of entries) {
      // get the child by matching it via the resized node
      const child = this.children.find(child => child.node === entry.target);
      if (child == null) {
        // if we did not find a child for this change, it might have been the
        // list view itself. In this case we also need a layout pass.
        hasChanges ||= entry.target === this.root.nativeElement;

        continue;
      }

      // get the new height of the child
      const height = entry.borderBoxSize[0].blockSize;

      // only mark the child dirty if it has changed to our previous value.
      if (child.height != height) {
        if (height === 0) {
          console.warn('Got zero size for child', child);
        }

        debug('Child size changed from %d to %d', child.height, height)

        child.height = height;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      // trigger a re-layout if something has actually changed
      this.updateContent();
    }
  }

  /**
   * Returns a Child instance bound with the given item data
   * attached to the list view container.
   * If the view is already attached, it is not rebound.
   */
  private getChild(index: number): Child {
    const existingChild = this.findChild(index);
    if (existingChild != null) {
      return existingChild;
    }

    const item = this.items[index];

    return this.ngZone.runTask(() => {
      // create the child and insert it into the view at the right place
      const child = this.recycler.get(item.component);
      return this.attachChild(child, index, item);
    });
  }

  /**
   * Detaches a view and gives it back to the recycler.
   */
  private recycleChild(child: Child) {
    this.recycler.cacheChild(this.detachChild(child))
  }

  /**
   * Binds the item to the given child.
   */
  private bindInputsOutputs(child: Child, item: ListItem) {
    if (item.inputs) {
      for (const [key, value] of Object.entries(item.inputs)) {
        child.ref.setInput(key, value)
      }
    }

    child.subscription?.unsubscribe();

    if (item.outputs) {
      child.subscription = new Subscription();

      for (const [key, value] of Object.entries(item.outputs)) {
        const output = (child.ref.instance as any)[key];

        if (output instanceof EventEmitter) {
          child.subscription.add(
            output.subscribe(event => value(event))
          );
        }
      }
    }
  }

  private offsetChildrenKeepScroll(space: number) {
    for (const child of this.children) {
      child.top += space;
      child.node.style.top = child.top + 'px';
    }

    this.offsetY += space;
  }
}
