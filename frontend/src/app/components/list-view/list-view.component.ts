import {
  type AfterViewInit,
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  createComponent,
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

export type ListItem = {
  component: Type<unknown>,
  inputs?: Record<string, unknown>,
  outputs?: Record<string, (value: any) => void>,
}

type Child = {
  node: HTMLElement,
  ref: ComponentRef<unknown>,
  index: number,
  height: number | null,
  top: number | null,
  dirty: boolean,
  subscription: Subscription | null,
}

function debug(...args: any[]) {
  // console.debug(...args);
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
  private readonly injector = inject(EnvironmentInjector);
  private readonly applicationRef = inject(ApplicationRef);
  private readonly ngZone = inject(NgZone);

  private readonly root: ElementRef<HTMLElement> = inject(ElementRef);

  @ViewChild('Canvas')
  protected canvas!: ElementRef<HTMLElement>;

  @Input()
  public initialIndex: number | null = null;

  // the index of the first visible item
  public firstVisible: number = 0;

  protected lastRootHeight = 0;
  protected children: Child[] = [];

  private schedule = new AnimationSchedule();

  private readonly observer = new ResizeObserver(entries => this.resizeObserverCallback(entries));
  private readonly cache = new Map<Type<unknown>, Child[]>();

  private maxTop: number = 0;

  @Input({required: true})
  public items!: ListItem[]

  /**
   * Number of items to prepare above and below the scroll window
   */
  @Input({transform: numberAttribute})
  public bufferSize: number = 3;

  /**
   * Minimum number of items to instantiate
   */
  @Input({transform: numberAttribute})
  public minWindowSize: number = 10;

  /**
   * Number of detached views to store per component.
   */
  @Input({transform: numberAttribute})
  public perComponentCacheSize: number = 10;

  protected get offsetY(): number {
    return this.root.nativeElement.scrollTop;
  }

  protected set offsetY(value: number) {
    this.root.nativeElement.scrollTop = value;
  }

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

  ngAfterViewInit() {
    if (this.initialIndex) {
      this.firstVisible = this.initialIndex;
    }

    this.offsetY = 0;

    this.ngZone.runOutsideAngular(() => {
      this.root.nativeElement.addEventListener('scroll', () => this.updateContent());
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    debug('Changes', changes);

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
        this.detachChild(child);
        this.cacheChild(child);
        continue;
      }

      // child is compatible, update input and outputs now
      debug('Can rebind child at ', child.index);
      this.bindInputsOutputs(child, item);
    }

    this.updateContent();
  }

  ngOnDestroy(): void {
    this.schedule.destroy();
    this.observer.disconnect();

    debug('Destroy cached nodes')
    for (const child of [...this.cache.values()].flat()) {
      this.destroyChild(child);
    }
  }

  protected updateContent(height: number = this.lastRootHeight) {
    debug('updateContent()')
    this.lastRootHeight = height;

    // ensure layout is fine first. We need to do this to
    // be able to use top + height in the code below
    this.layout();

    // we might need to reset scrolling if we have no anchor to work with
    this.resetScrolling();

    // find all visible children
    const visibleChildren = this.children.filter(child => {
      return child.top != null && child.height != null
        && child.top + child.height > this.offsetY
        && child.top < this.offsetY + height
    });

    if (visibleChildren.length) {
      // estimate the first visible index
      const firstVisibleIdx = visibleChildren[0].index;

      if (this.firstVisible !== firstVisibleIdx) {
        debug('First visible is now', firstVisibleIdx);
        this.firstVisible = firstVisibleIdx;
      }
    }

    // check how many nodes we're currently showing and how space they use
    const heightOfVisibleChildren = visibleChildren.reduce((acc, ch) => acc + (ch.height ?? 0), 0);

    if (heightOfVisibleChildren < height && this.items.length) {
      if (!visibleChildren.length || visibleChildren[visibleChildren.length - 1].index === this.items.length) {
        debug('Visible children count:', visibleChildren.length)
        debug('Height of visible children is not enough, need to add more children');

        // schedule another layout pass in the next frame to add more items
        this.schedule.schedule('updateContent', () => this.updateContent());
      }
    }

    // calculate the indices we want to show
    const minIndexToShow = this.firstVisible - this.bufferSize;
    const maxIndexToShow = this.firstVisible + Math.max(this.minWindowSize, visibleChildren.length) + this.bufferSize - 1;

    // only keep a few elements above the window
    this.cleanupChildrenOutsideOf(minIndexToShow, maxIndexToShow);

    // fill elements starting at the first one to show
    for (let index = minIndexToShow; index <= maxIndexToShow; index++) {
      const item = this.items[index];
      if (item == null) {
        // no such item, stop here
        continue;
      }

      let child = this.children.find(child => child.index === index);
      if (child != null) {
        // the child already exists, nothing to do here
        continue;
      }

      this.ngZone.runTask(() => {
        // create the child and insert it into the view at the right place
        const child = this.cachedChild(item, index) ?? this.createChild(item, index);
        this.bindInputsOutputs(child, item);
        this.attachChild(child);
      });
    }

    // we might have placed new children into the dom,
    // so we might need to re-layout again
    this.layout();

    // calculate new height for the canvas based on the now layouted children
    this.updateCanvasSize();
  }

  private cleanupChildrenOutsideOf(minIndexToShow: number, maxIndexToShow: number) {
    for (const child of [...this.children]) {
      if (child.top != null && child.height != null) {
        if (child.index < minIndexToShow || child.index > maxIndexToShow) {
          this.detachChild(child);
          this.cacheChild(child);
        }
      }
    }
  }

  private resetScrolling() {
    if (!this.children.length) {
      this.offsetY = 0;
    }

    // it looks like someone scrolled so fast that no child is visible
    // anymore. In this case we just reset scrolling.
    const hasVisibleChildren = this.children.some(child => {
      return child.top != null && child.height != null
        && child.top + child.height > this.offsetY
        && child.top < this.offsetY + this.lastRootHeight
    });

    if (!hasVisibleChildren) {
      this.offsetY = this.children[0]?.top ?? 0;
    }
  }

  private anchorChild(): Child | null {
    return this.children.find(child => child.top != null && child.top >= this.offsetY)
      ?? this.children.find(child => child.index === this.firstVisible)
      ?? null;
  }

  private layout() {
    if (this.children.length === 0) {
      return;
    }

    this.children.sort((lhs, rhs) => {
      return lhs.index - rhs.index;
    })

    const anchorChild = this.anchorChild();
    if (anchorChild == null) {
      return;
    }

    if (!this.children.some(child => child.dirty && child.height != null)) {
      // layout is clean, no need to do anything
      return;
    }

    let top = anchorChild.top ?? 0;

    // layout all children that are (at least partially) below the anchor
    // from top to bottom
    for (const child of this.children) {
      if (child.height == null) {
        // no known height for this child,
        // we can not layout it right now
        continue;
      }

      if (child.index >= anchorChild.index) {
        if (child.top == null) {
          // first layout, make it visible
          child.node.classList.add('layouted');
        }

        child.top = top;
        child.node.style.top = top + 'px';
        child.dirty = false;

        top += child.height;
      }
    }

    // start again for the invisible item before the first visible one,
    // but this time in reverse
    top = anchorChild.top ?? 0;

    // layout the children above the anchor in reverse,
    // setting their top position based on the next node in the list.
    for (let i = this.children.length - 1; i >= 0; i--) {
      const child = this.children[i];

      if (child.height == null) {
        // no known height for this child,
        // we can not layout it right now
        continue;
      }

      if (child.index < anchorChild.index) {
        if (child.top == null) {
          // first layout, make it visible
          child.node.classList.add('layouted');
        }

        top -= child.height;

        child.top = top;
        child.node.style.top = top + 'px';
        child.dirty = false;
      }
    }

    // fix scroll offset if we've layouted children to the outside of the scroll container.
    const firstChild = this.children.find(child => child.top != null);
    if (firstChild?.top != null) {
      if (firstChild.index === 0 && firstChild.top > 0) {
        debug('Anchor not at zero, fixing this now.');

        const removedSpace = firstChild.top;
        this.offsetChildrenBy(-removedSpace);
        this.offsetY -= removedSpace;

      } else if (firstChild.top < 0) {
        // if we have layouted some content "before" the container, we need to correct all children
        // again to move them out of the container area. We also need to offset the current scroll
        // by the same amount.
        const newSpace = -top;

        debug('Put children outside of container, adjust offset+scroll by', newSpace);

        this.offsetChildrenBy(newSpace);
        this.offsetY += newSpace;
      }
    }
  }

  private updateCanvasSize() {
    if (this.children.length === 0) {
      this.canvas.nativeElement.style.height = '200%';
      return;
    }

    const lastChild = this.children[this.children.length - 1];

    if (lastChild != null && lastChild.top != null && lastChild.height != null) {
      if (lastChild.index === this.items.length - 1) {
        // actually the last one
        this.maxTop = lastChild.top + lastChild.height;
      } else {
        // estimate on how many more rows we might need to add
        const extraSpace = 100 * (this.items.length - lastChild.index + 1);
        this.maxTop = Math.max(this.maxTop, lastChild.top + lastChild.height + extraSpace);
      }
    }

    this.canvas.nativeElement.style.height = this.maxTop + 'px';
  }

  private offsetChildrenBy(y: number) {
    for (const child of this.children) {
      if (child.top != null) {
        child.top += y;
        child.node.style.top = child.top + 'px';
      }
    }
  }

  private createChild(item: ListItem, idx: number): Child {
    debug('Create child', idx);

    const node = document.createElement('div');

    const ref = createComponent(item.component, {
      environmentInjector: this.injector,
    })

    return {
      node,
      ref,
      top: null,
      height: null,
      dirty: false,
      index: idx,
      subscription: null,
    }
  }

  private attachChild(child: Child): void {
    child.node.append(child.ref.location.nativeElement);
    child.node.dataset['index'] = child.index.toString();

    // check for the previous child
    const next = this.children.find(ch => ch.index === child.index + 1);
    this.canvas.nativeElement.insertBefore(child.node, next?.node ?? null);

    this.applicationRef.attachView(child.ref.hostView);
    this.observer.observe(child.node, {box: 'border-box'});
    this.children.push(child);
  }

  private detachChild(child: Child) {
    debug('Detaching child', child.index);
    removeInplace(this.children, child);

    child.subscription?.unsubscribe()

    child.top = null;
    child.height = null;
    child.dirty = false;
    child.subscription = null;

    this.observer.unobserve(child.node);
    this.applicationRef.detachView(child.ref.hostView);
    this.canvas.nativeElement.removeChild(child.node);

    child.node.classList.remove('layouted')
  }

  private destroyChild(child: Child) {
    debug('Destroying child', child.index);
    child.ref.destroy();
    child.node.innerHTML = '';
  }

  private cacheChild(child: Child) {
    let cache = this.cache.get(child.ref.componentType);
    if (cache == null) {
      this.cache.set(child.ref.componentType, cache = []);
    }

    if (cache.length >= this.perComponentCacheSize) {
      // we have enough items in the cache, remove this one.
      this.destroyChild(child);
      return;
    }

    debug('Put child into cache', child.index)
    cache.push(child);
  }

  private cachedChild(item: ListItem, idx: number): Child | null {
    const child = this.cache.get(item.component)?.pop();
    if (child == null) {
      return null;
    }

    child.index = idx;

    debug('Returning child from cache:', child.index);
    return child;
  }

  private resizeObserverCallback(entries: ResizeObserverEntry[]) {
    for (const entry of entries) {
      // get the child by matching it via the resized node
      const child = this.children.find(child => child.node === entry.target);
      if (child == null) {
        continue;
      }

      // get the new height of the child
      const height = entry.borderBoxSize[0].blockSize;

      // only mark the child dirty if it has changed to our previous value.
      if (child.height != height) {
        if (height === 0) {
          console.warn('Got zero size for child', child);
        }

        child.height = height;
        child.dirty = true;
      }
    }

    // trigger a re-layout
    this.updateContent();
  }

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
}

type AnimationHandler = (dt: number) => void;

class AnimationSchedule {
  private handlers = new Map<string, AnimationHandler>();

  private rafId: number | null = null;

  public schedule(id: string, handler: AnimationHandler) {
    this.handlers.set(id, handler);

    if (this.rafId == null) {
      const lastTime = performance.now();

      this.rafId = requestAnimationFrame(() => {
        const dt: number = (performance.now() - lastTime) / 1000;
        this.dispatch(dt)
      });
    }
  }

  public destroy() {
    this.handlers.clear();

    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private dispatch(dt: number) {
    const handlers = [...this.handlers.values()];

    // cleanup this animation cycle
    this.rafId = null;
    this.handlers.clear();

    for (const handler of handlers) {
      handler(dt);
    }
  }
}
