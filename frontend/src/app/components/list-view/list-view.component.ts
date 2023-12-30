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
  type OnChanges,
  type OnDestroy,
  type SimpleChanges,
  type Type,
  ViewChild
} from '@angular/core';
import {enterNgZone, observeElementSize} from '../../util';
import {distinctUntilChanged, filter, map, Subscription} from 'rxjs';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import PointerTracker from 'pointer-tracker';

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
  private readonly injector = inject(EnvironmentInjector);
  private readonly applicationRef = inject(ApplicationRef);
  private readonly ngZone = inject(NgZone);

  private readonly root: ElementRef<HTMLElement> = inject(ElementRef);

  @ViewChild('Canvas')
  protected canvas!: ElementRef<HTMLElement>;

  // the index of the first visible item
  protected firstVisible: number = 0;

  // top position of the first visible item
  protected firstTop: number = 0;

  protected offsetY: number = 0;

  protected lastRootHeight = 0;
  protected children: Child[] = [];

  private fling = new FlingVelocity(0);
  private schedule = new AnimationSchedule();

  private readonly observer = new ResizeObserver(entries => this.resizeObserver(entries));

  private readonly cache = new Map<Type<unknown>, Child[]>();

  @Input({required: true})
  public items!: ListItem[]

  @Input()
  public minHeight = 50;

  constructor() {
    observeElementSize(this.root.nativeElement)
      .pipe(
        map(sizes => sizes.height),
        filter(height => height > 0),
        distinctUntilChanged(),
        takeUntilDestroyed(),
        enterNgZone(this.ngZone),
      )
      .subscribe(height => this.updateContent(height));
  }

  ngAfterViewInit() {
    this.ngZone.runOutsideAngular(() => {
      const velocityTracker = new VelocityTracker();

      const tracker: PointerTracker = new PointerTracker(this.root.nativeElement, {
        start: () => {
          // accept as a new pointer only if this is the first one.
          if (tracker.currentPointers.length > 0) {
            return false;
          }

          // stop any active fling now
          this.fling.velocity = 0;

          return true;
        },

        move: previousPointers => {
          const prevY = previousPointers[0].pageY;
          const currY = tracker.currentPointers[0].pageY;

          const dy = prevY - currY;
          this.offsetY += dy;
          this.updateContent();

          velocityTracker.track(currY);
        },

        end: () => {
          const velocity = velocityTracker.get();
          if (velocity && Math.abs(velocity) >= 1) {
            debug('Starting fling with velocity of', velocity);
            this.fling.velocity = velocity;
            this.schedule.schedule('fling', dt => this.animate(dt));
          }

          velocityTracker.clear();
        }
      })

      this.root.nativeElement.addEventListener('wheel', event => {
        this.offsetY += event.deltaY;
        this.updateContent();
      })
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    console.info('Changes', changes);

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
    debug('Destroy cached nodes')
    for (const child of [...this.cache.values()].flat()) {
      this.destroyChild(child);
    }
  }

  private animate(dt: number) {
    this.fling.update(dt);
    this.offsetY -= this.fling.velocity * dt;
    this.updateContent();

    if (!this.fling.stopped) {
      this.schedule.schedule('fling', dt => this.animate(dt));
    }
  }

  protected updateContent(height: number = this.lastRootHeight) {
    this.lastRootHeight = height;

    // ensure layout is fine first. We need to do this to
    // be able to use top + height in the code below
    this.layout();

    // find the first child that is currently at least partially visible according to
    // our layout data.
    const firstVisibleChild = this.children.find(child => {
      return child.top != null
        && child.height != null
        && child.top <= this.offsetY && this.offsetY < child.top + child.height
    })

    if (firstVisibleChild) {
      const firstVisibleIdx = firstVisibleChild.index;

      if (this.firstVisible !== firstVisibleIdx) {
        debug('First visible is now', firstVisibleIdx);
        this.firstVisible = Math.max(0, firstVisibleIdx);
        this.firstTop = firstVisibleChild.top!;
      }
    }

    const amountToShow = Math.ceil(height / this.minHeight);

    // only keep a few elements above the window
    for (const child of [...this.children]) {
      if (child.index < this.firstVisible - 3 || child.index > this.firstVisible + amountToShow) {
        this.detachChild(child);
        this.cacheChild(child);
      }
    }

    // fill elements starting at the first one to show
    for (let i = -3; i < amountToShow; i++) {
      const index = i + this.firstVisible;

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

    // with the most recent positional data we can limit scrolling now
    this.limitScrolling();

    // apply transform
    this.canvas.nativeElement.style.setProperty('--offset-y', (-this.offsetY) + 'px');
  }

  private limitScrolling() {
    if (this.children.length) {
      const last = this.children[this.children.length - 1];
      if (last.top != null && last.height) {
        if (this.offsetY + this.lastRootHeight > last.top + last.height) {
          this.offsetY = last.top + last.height - this.lastRootHeight
        }
      }

      const first = this.children[0];
      if (first.top != null && this.offsetY < first.top) {
        this.offsetY = first.top;
      }
    } else {
      this.offsetY = 0;
    }
  }

  private layout() {
    let top = this.firstTop;

    this.children.sort((lhs, rhs) => {
      return lhs.index - rhs.index;
    })

    if (!this.children.some(child => child.dirty && child.height != null)) {
      // layout is clean, no need to do anything
      return;
    }

    // layout all children that are (at least partially) below the anchor
    // from top to bottom
    for (const child of this.children) {
      if (child.height == null) {
        // no known height for this child,
        // we can not layout it right now
        continue;
      }

      if (child.index >= this.firstVisible) {
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

    top = this.firstTop;

    // layout the children above the anchor in reverse,
    // setting their top position based on the next node in the list.
    for (let i = this.children.length - 1; i >= 0; i--) {
      const child = this.children[i];

      if (child.height == null) {
        // no known height for this child,
        // we can not layout it right now
        continue;
      }

      if (child.index < this.firstVisible) {
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

    this.canvas.nativeElement.append(child.node);
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
    debug('Destrying child', child.index);
    child.ref.destroy();
    child.node.innerHTML = '';
  }

  private cacheChild(child: Child) {
    let cache = this.cache.get(child.ref.componentType);
    if (cache == null) {
      this.cache.set(child.ref.componentType, cache = []);
    }

    if (cache.length >= 4) {
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

  private resizeObserver(entries: ResizeObserverEntry[]) {
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

    this.schedule.schedule('layout', () => this.layout());
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

class FlingVelocity {
  constructor(public velocity: number, private readonly friction: number = -4.2) {
  }

  get stopped(): boolean {
    return this.isAtEquilibrium();
  }

  public update(dt: number) {
    // more friction when already slow down
    const friction = this.friction - 2 * (1 - Math.min(1, Math.abs(this.velocity) / 100));

    const v1 = this.velocity * Math.exp(dt * friction)
    const v2 = this.velocity - Math.sign(this.velocity) * 4000 * dt;

    // interpolate between linear slowdown above 2000px/s and friction below 4000px/s
    const f = Math.min(1, Math.max(0, Math.abs(this.velocity) - 2000) / 2000);
    this.velocity = f * v2 + (1 - f) * v1;

    if (this.isAtEquilibrium()) {
      this.velocity = 0;
    }
  }

  private isAtEquilibrium(): boolean {
    return Math.abs(this.velocity) < 0.5;
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

type VelocityItem = {
  time: number,
  position: number,
}

class VelocityTracker {
  private readonly items: VelocityItem[] = [];

  public track(position: number) {
    this.items.push({time: performance.now(), position})

    if (this.items.length > 2) {
      this.items.shift();
    }
  }

  public get(): number | null {
    if (this.items.length < 2) {
      return null;
    }

    const prev = this.items[this.items.length - 2];
    const recent = this.items[this.items.length - 1];

    // no movement since the last measurement
    if (performance.now() - recent.time > 100) {
      return null;
    }

    // almost no movement between the last two measurements
    if (prev && Math.abs(recent.position - prev.position) < 2) {
      return null;
    }

    return 1000 * (recent.position - prev.position) / (recent.time - prev.time)
  }

  public clear() {
    this.items.splice(0);
  }
}
