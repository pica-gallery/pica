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
  Output,
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

export type SavedScroll = {
  index: number,
  offsetY: number,
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
  private canvas!: ElementRef<HTMLElement>;

  private canvasHeight: number = 0;
  private lastRootHeight = 0;
  private readonly children: Child[] = [];

  private readonly observer = new ResizeObserver(entries => this.resizeObserverCallback(entries));
  private readonly recycler = new ViewRecycler(inject(EnvironmentInjector));


  @Input()
  public items: ListItem[] = [];

  @Input()
  public initialScroll: SavedScroll | null = null;

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
  public perComponentCacheSize: number = 4;

  @Output()
  scrollChanged = new EventEmitter<SavedScroll>();

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

    this.scrollChanged.subscribe(ev => console.info(ev));
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

    this.lastRootHeight = height;

    // we might need to reset scrolling if we have no anchor to work with
    this.resetScrolling();

    // keep a list of children that we actually layout, so we can
    // later remove all children from the canvas, that were not layout.
    const childrenToKeep = new Set();

    // function to track children that were layout
    const layoutChild = (child: Child, top: number): boolean => {
      childrenToKeep.add(child);
      this.layoutChild(child, top);
      return childrenToKeep.size < this.maxChildrenToLayout
    }

    // run the actual layout
    if (this.items.length > 0) {
      this.layout(layoutChild, height);
    }

    // remove all the children that we did not layout this time
    for (const child of [...this.children]) {
      if (!childrenToKeep.has(child)) {
        this.recycleChild(child);
      }
    }

    // fix any children that were layout outside of the container
    this.fixOverflow();

    // calculate new height for the canvas based on the now layouted children
    this.updateCanvasSize();

    // build the new scroll and emit it
    const anchorChild = this.anchorChild()
    if (anchorChild != null) {
      const offsetY = anchorChild.top - this.offsetY;
      this.scrollChanged.emit({index: anchorChild.index, offsetY})
    }


    const duration = performance.now() - now;
    if (duration >= 16) {
      debug('[slow] updateContent() took %sms', duration.toFixed(2));
    }
  }

  private anchorScroll(): SavedScroll {
    // find the child we want to anchor all the views to
    const anchorChild = this.anchorChild();
    if (anchorChild != null) {
      return {
        index: anchorChild.index,
        offsetY: anchorChild.top,
      }
    }

    // use initial scroll if it has valid values
    if (this.initialScroll) {
      if (this.initialScroll.index >= 0 && this.initialScroll.index < this.items.length) {
        return this.initialScroll
      }
    }

    return {index: 0, offsetY: 0}
  }

  private layout(layoutChild: (child: Child, top: number) => boolean, height: number) {
    const {index: indexStart, offsetY: anchorTop} = this.anchorScroll();

    // fill elements starting at the first one to show
    let nextTop = anchorTop;
    for (let index = indexStart; index < this.items.length; index++) {
      const child = this.getChild(index);

      if (!layoutChild(child, nextTop)) {
        break;
      }

      nextTop += child.height;

      if (nextTop > this.offsetY + height + this.bufferSize) {
        break;
      }
    }

    // go backwards starting at the child before the anchor
    let previousTop = anchorTop;
    for (let index = indexStart - 1; index >= 0; index--) {
      const child = this.getChild(index);

      if (!layoutChild(child, previousTop - child.height)) {
        break;
      }

      previousTop -= child.height;

      if (previousTop < this.offsetY - this.bufferSize) {
        break;
      }
    }
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
    for (const child of this.children) {
      const visible = child.top + child.height > this.offsetY && child.top < this.offsetY + this.lastRootHeight;
      if (visible) {
        return;
      }
    }

    // it looks like someone scrolled so fast that no child is visible
    // anymore. In this case we just reset scrolling to the position
    // of the first child that we have
    this.offsetY = this.children[0]?.top ?? 0;
  }

  private anchorChild(): Child | null {
    return this.children.find(child => child.top >= this.offsetY) ?? null;
  }

  private minChild(): Child | null {
    let minChild = this.children[0] ?? null;

    for (let i = 1; i < this.children.length; i++) {
      if (this.children[i].top < minChild.top) {
        minChild = this.children[i];
      }
    }

    return minChild;
  }

  private maxChild(): Child | null {
    let maxChild = this.children[0] ?? null;

    for (let i = 1; i < this.children.length; i++) {
      if (this.children[i].top + this.children[i].height > maxChild.top + maxChild.height) {
        maxChild = this.children[i];
      }
    }

    return maxChild;
  }

  private fixOverflow() {
    // fix scroll offset if we've layouted children to the outside of the scroll container.
    const minChild = this.minChild();
    if (minChild == null) {
      return
    }

    if (minChild.index === 0 && minChild.top > 0) {
      const removedSpace = -minChild.top;
      debug('First child not at zero, moving views up by %d', removedSpace);
      this.offsetChildrenKeepScroll(removedSpace);

    } else if (minChild.top < 0) {
      // if we have layouted some content "before" the container, we need to correct all children
      // again to move them out of the container area. We also need to offset the current scroll
      // by the same amount.
      const newSpace = -minChild.top;
      debug('Children are overflowing on top, moving everything down by %d', newSpace);
      this.offsetChildrenKeepScroll(newSpace)
    }
  }

  private updateCanvasSize() {
    if (this.children.length === 0) {
      this.canvas.nativeElement.style.height = '200%';
      return;
    }

    const maxChild = this.maxChild()!;

    if (maxChild.index === this.items.length - 1) {
      // actually the last one
      this.canvasHeight = maxChild.top + maxChild.height;
    } else {
      // estimate on how many more rows we might need to add
      const extraSpace = 100 * (this.items.length - maxChild.index + 1);
      this.canvasHeight = Math.max(this.canvasHeight, maxChild.top + maxChild.height + extraSpace);
    }

    this.canvas.nativeElement.style.height = this.canvasHeight + 'px';
  }

  private attachChild(detachedChild: DetachedChild, idx: number, item: ListItem): Child {
    const child: Child = {
      node: detachedChild.node,
      ref: detachedChild.ref,
      index: idx,
      subscription: null,

      // not yet layouted
      top: Number.NaN,

      // not yet measured
      height: Number.NaN,
    }

    child.node.append(child.ref.location.nativeElement);
    child.node.dataset['index'] = child.index.toString();

    // check for the next child so we can insert this one before
    const next = this.findChild(child.index + 1);
    this.canvas.nativeElement.insertBefore(child.node, next?.node ?? null);

    this.applicationRef.attachView(child.ref.hostView);
    this.observer.observe(child.node, {box: 'border-box'});

    const idxToInsert = this.children.findIndex(ch => ch.index > child.index)
    this.children.splice(idxToInsert === -1 ? this.children.length : idxToInsert, 0, child);

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

function negate(val: number | null | undefined): number | null | undefined {
  return val != null ? -val : val;
}
