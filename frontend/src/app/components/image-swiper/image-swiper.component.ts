import {
  type AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  EventEmitter,
  Input,
  NgZone,
  type OnDestroy,
  Output,
  ViewChild
} from '@angular/core';
import {CommonModule} from '@angular/common';
import type {MediaId} from '../../service/api';
import {ImageViewComponent} from '../image-view/image-view.component';
import type {MediaItem} from '../../service/gallery';
import {BehaviorSubject, distinctUntilChanged, ReplaySubject, tap} from 'rxjs';
import PointerTracker, {type Pointer} from 'pointer-tracker';

type ViewItem = {
  id: MediaId,
  index: number,
  media: MediaItem,
  focus: boolean,
}

@Component({
  selector: 'app-image-swiper',
  standalone: true,
  imports: [CommonModule, ImageViewComponent],
  templateUrl: './image-swiper.component.html',
  styleUrls: ['./image-swiper.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ImageSwiperComponent implements AfterViewInit, OnDestroy {
  @Input({required: true})
  public items!: MediaItem[]

  @Input()
  public mediaToShowOnInit: MediaId | null = null;

  @ViewChild('Container', {static: true})
  protected container!: ElementRef<HTMLElement>;

  @Output()
  protected readonly itemChanged = new EventEmitter<MediaItem>();

  // the item that is currently visible
  protected readonly currentItemSubject = new ReplaySubject<MediaItem>(1);

  private readonly visibleItemsSubject = new BehaviorSubject<ViewItem[]>([]);

  protected readonly visibleItems$ = this.visibleItemsSubject.pipe(
    distinctUntilChanged(itemsAreEqual),
    tap(items => console.log('View items have changed:', items)),
  );

  // initialized in ngAfterViewInit
  private tracker!: PointerTracker;

  constructor(private readonly ngZone: NgZone) {
  }

  ngAfterViewInit(): void {
    const container = this.container.nativeElement!;

    // jump to the selected image
    const initialIndex = Math.max(0, this.items.findIndex(img => img.id === this.mediaToShowOnInit));
    const touch = new Touch(initialIndex);

    this.ngZone.runOutsideAngular(() => {
      // when an animation stops, we update the visibility
      container.addEventListener('transitionend', () => {
        touch.transitionEnd();
      })

      this.tracker = new PointerTracker(container, {
        // avoidPointerEvents: true,
        start: (pointer, event) => touch.start(this.tracker, pointer),
        move: (previous, changed, event) => touch.move(this.tracker, previous),
        end: (pointer, event, cancelled) => touch.end(this.tracker, pointer),
      })

      window.addEventListener('resize', () => touch.onWindowResize());

      const findCurrentChild = (idx: number): HTMLElement => {
        const media = this.items[idx];

        const currentChild = Array
          .from(container.children)
          .find(el => el instanceof HTMLElement && el.dataset['mediaId'] === media.id) as HTMLElement | undefined;

        if (currentChild == null) {
          throw new Error(`Did not find child with mediaId=${media.id}`)
        }

        return currentChild;
      }

      touch.events.subscribe(event => {
        this.ngZone.run(() => {
          switch (event.type) {
            case 'animateSwipe':
              console.info('Start animation to swipe target');
              container.classList.add('animate')
              container.style.setProperty('--transformX', event.transformX + 'px');
              break;

            case 'applySwipeTransform':
              container.classList.remove('animate')
              container.style.setProperty('--transformX', event.transformX + 'px');
              break;

            case 'animateZoomTransform': {
              const currentChild = findCurrentChild(event.currentIndex);
              currentChild.classList.add('animate');
              currentChild.style.setProperty('--x', event.transform.e + 'px')
              currentChild.style.setProperty('--y', event.transform.f + 'px')
              currentChild.style.setProperty('--scale', event.transform.a.toString())
              break;
            }

            case 'applyZoomTransform': {
              const currentChild = findCurrentChild(event.currentIndex);
              currentChild.classList.remove('animate');
              currentChild.style.setProperty('--x', event.transform.e + 'px')
              currentChild.style.setProperty('--y', event.transform.f + 'px')
              currentChild.style.setProperty('--scale', event.transform.a.toString())
              break;
            }

            case 'stopAnimation':
              console.info('Animation has stopped.');
              container.classList.remove('animate');
              break;

            case 'updateCurrent':
              console.info('Current index is now:', event.currentIndex);
              this.ngZone.run(() => this.updateItemVisibility(event.currentIndex));

              const curr = this.items[event.currentIndex];
              touch.currentAspectRatio = curr.width / curr.height;

              break;
          }
        })
      })

      touch.initialize();
    });
  }

  private updateItemVisibility(itemIndex: number) {
    console.info('Update visibility of images, current index:', itemIndex);

    const items: ViewItem[] = [];

    for (let idx = 0; idx < this.items.length; idx++) {
      const visible = idx >= itemIndex - 5 && idx <= itemIndex + 5;
      if (!visible) {
        continue
      }

      const focus = idx >= itemIndex - 1 && idx <= itemIndex + 1;
      const media = this.items[idx];
      items.push({id: media.id, index: idx, media, focus})
    }

    this.visibleItemsSubject.next(items);

    this.itemChanged.next(this.items[itemIndex]);
    this.currentItemSubject.next(this.items[itemIndex]);
  }

  ngOnDestroy() {
    // this.io.unobserve(this.element.nativeElement)
  }
}

function itemsAreEqual(lhs: ViewItem[], rhs: ViewItem[]): boolean {
  if (lhs.length !== rhs.length) {
    return false;
  }

  for (let idx = 0; idx < lhs.length; idx++) {
    let lhsItem = lhs[idx];
    let rhsItem = rhs[idx];

    if (lhsItem.id !== rhsItem.id) {
      return false;
    }

    if (lhsItem.focus !== rhsItem.focus) {
      return false;
    }

    if (lhsItem.index !== rhsItem.index) {
      return false;
    }
  }

  return true;
}

type TouchState =
  | 'blocked'
  | 'undecided'
  | 'zooming'
  | 'swiping'

type AnimationEvent =
  | { type: 'animateSwipe', transformX: number }
  | { type: 'applySwipeTransform', transformX: number }
  | { type: 'applyZoomTransform', currentIndex: number, transform: DOMMatrix }
  | { type: 'animateZoomTransform', currentIndex: number, transform: DOMMatrix }
  | { type: 'updateCurrent', currentIndex: number }
  | { type: 'stopAnimation' }


class Touch {
  private state: TouchState = 'undecided';

  private zoomTransform: DOMMatrix = identity();
  private zoomLookingAt: Point = {x: 0, y: 0};

  // both values are always negative
  private swipeTranslateXStart: number = 0;
  private swipeTranslateX: number = 0;
  private swipeFlingTo: number = 0;

  public readonly events = new EventEmitter<AnimationEvent>();

  public currentAspectRatio: number = 1;

  constructor(private idxCurrent: number) {
  }

  initialize() {
    this.events.emit({
      type: 'applySwipeTransform',
      transformX: this.swipeXOfIndex(this.idxCurrent),
    });

    this.events.emit({
      type: 'updateCurrent',
      currentIndex: this.idxCurrent,
    });
  }

  start(tracker: PointerTracker, pointer: Pointer): boolean {
    if (this.state === 'blocked') {
      // do not accept new touch input right now
      return false;
    }

    if (this.state === 'swiping' && tracker.currentPointers.length >= 1) {
      // only track the first pointer
      return false;
    }

    // in general, track only two pointers
    return tracker.currentPointers.length < 2;
  }

  move(tracker: PointerTracker, previous: Pointer[]): void {
    if (this.state === 'undecided') {
      const newState = this.tryCommitToState(tracker);
      if (newState == null) {
        return;
      }

      console.info('Comitted to state:', this.state);

      if (newState === 'swiping') {
        this.swipeTranslateXStart = this.swipeXOfIndex(this.idxCurrent);
      }
    }

    const initial = tracker.startPointers;
    const current = tracker.currentPointers;

    if (this.state === 'swiping') {
      const dxSinceStart = current[0].clientX - initial[0].clientX;
      this.swipeTranslateX = this.swipeTranslateXStart + dxSinceStart;

      this.events.emit({
        type: 'applySwipeTransform',
        transformX: this.swipeTranslateX,
      });

      // if we would end touch now, we might need to initiate a fling
      const dxSincePrev = previous[0].clientX - current[0].clientX;
      this.swipeFlingTo = Math.abs(dxSincePrev) > 2 ? Math.sign(dxSincePrev) : 0;
    }

    if (this.state === 'zooming') {
      if (previous.length === 1) {
        // simple pan only

        const dx = current[0].clientX - previous[0].clientX;
        const dy = current[0].clientY - previous[0].clientY;

        this.updateZoomTransform({panX: dx, panY: dy, scale: 1, originX: 0, originY: 0});
      }

      if (previous.length === 2) {
        const bbOffset = this.zoomTransform.transformPoint({x: 0, y: 0});

        // estimate pan based on midpoints
        let m1 = midpoint(previous[0], previous[1]);
        let m2 = midpoint(current[0], current[1]);

        // Midpoint within the element
        const originX = m1.x - bbOffset.x;
        const originY = m1.y - bbOffset.y;

        // estimate scale based on change of distance
        let d1 = distanceTo(previous[0], previous[1]) || 1;
        let d2 = distanceTo(current[0], current[1]);

        this.updateZoomTransform({
          panX: m2.x - m1.x,
          panY: m2.y - m1.y,
          scale: d2 / d1,
          originX,
          originY,
        })
      }

      this.events.emit({
        type: 'applyZoomTransform',
        currentIndex: this.idxCurrent,
        transform: this.zoomTransform,
      });
    }
  }

  end(tracker: PointerTracker, pointer: Pointer): void {
    if (tracker.currentPointers.length !== 0) {
      return
    }

    console.info('No more active pointers.')

    if (this.state === 'swiping') {
      const targetIndex = this.swipeFlingTo
        ? this.idxCurrent + this.swipeFlingTo
        : this.indexOfSwipeX(this.swipeTranslateX);

      this.idxCurrent = targetIndex;

      this.events.emit({
        type: 'animateSwipe',
        transformX: this.swipeXOfIndex(targetIndex),
      })

      // block input until animation finishes
      this.state = 'blocked';
      return;
    }

    if (this.state === 'zooming') {
      if (this.zoomed && this.zoomScale < 1.2) {
        this.zoomTransform = identity();

        this.events.emit({
          type: 'animateZoomTransform',
          currentIndex: this.idxCurrent,
          transform: this.zoomTransform,
        });
      }
    }

    this.state = 'undecided';
  }

  transitionEnd(): void {
    if (this.state === 'blocked') {
      console.info('Transition ended, unblocking input')
      this.state = 'undecided';
    }

    this.events.emit({
      type: 'updateCurrent',
      currentIndex: this.idxCurrent,
    });

    this.events.emit({
      type: 'stopAnimation',
    });
  }

  public onWindowResize() {
    if (this.zoomed) {
      this.zoomTransform = identity();

      this.events.emit({
        type: 'applyZoomTransform',
        currentIndex: this.idxCurrent,
        transform: this.zoomTransform,
      });
    }

    this.events.emit({type: 'stopAnimation'});

    this.swipeTranslateX = this.swipeXOfIndex(this.idxCurrent);

    this.events.emit({
      type: 'applySwipeTransform',
      transformX: this.swipeTranslateX,
    });
  }

  private get width(): number {
    return window.innerWidth + 16;
  }

  private indexOfSwipeX(x: number): number {
    return (-1 * (x - this.width / 2) / this.width) | 0;
  }

  private swipeXOfIndex(idx: number): number {
    return idx * -1 * this.width;
  }

  private tryCommitToState(tracker: PointerTracker): TouchState | null {
    const current = tracker.currentPointers;
    const initial = tracker.startPointers;

    if (this.zoomed || current.length === 2) {
      // we can directly commit to more zooming
      return this.state = 'zooming';
    }

    if (current.length === 1 && !this.zoomed) {
      // we have one pointer. if it moved at least 16px on x axis, we have a swipe
      const dx = current[0].clientX - initial[0].clientX;
      if (Math.abs(dx) > 16) {
        return this.state = 'swiping';
      }
    }

    return null;
  }

  private get zoomScale(): number {
    return this.zoomTransform.a;
  }

  private get zoomX(): number {
    return this.zoomTransform.e;
  }

  private get zoomY(): number {
    return this.zoomTransform.f;
  }

  private get zoomed(): boolean {
    return Math.abs(this.zoomScale - 1) > 1e-5;
  }

  private updateZoomTransform(opts: {
    originX: number,
    originY: number,
    panX: number,
    panY: number,
    scale: number,
  }) {
    if (this.zoomScale * opts.scale < 1) {
      opts.scale = 1 / this.zoomScale;
    } else if (this.zoomScale > 12.0 && opts.scale > 1.0) {
      opts.scale = 1.0;
    }

    this.zoomTransform = identity()
      // Translate according to panning.
      .translate(opts.panX, opts.panY)
      // Scale about the origin.
      .translate(opts.originX, opts.originY)
      // Apply current translate
      .translate(this.zoomX, this.zoomY)
      .scale(opts.scale)
      .translate(-opts.originX, -opts.originY)
      // Apply current scale.
      .scale(this.zoomScale);

    const {width, height, widthOfImage, heightOfImage} = this.zoomConfig();

    // top left point of image in the child component, transformed to 'container' space
    const tl = this.zoomTransform.transformPoint({
      x: width / 2 - widthOfImage / 2,
      y: height / 2 - heightOfImage / 2,
    });

    // bottom right point of image in the child component, transformed to 'container' space.
    const br = this.zoomTransform.transformPoint({
      x: width / 2 + widthOfImage / 2,
      y: height / 2 + heightOfImage / 2,
    });

    if (br.x - tl.x > width) {
      // image is width than screen
      // do not allow for a black bar left
      if (tl.x > 0) {
        this.zoomTransform.e -= tl.x;
      }

      // do not allow for a black bar right
      if (br.x < width) {
        this.zoomTransform.e += width - br.x
      }
    } else {
      // center horizontally
      this.zoomTransform.e = (width - width * this.zoomScale) / 2;
    }

    if (br.y - tl.y > height) {
      // image is higher than screen
      // do not allow for a black bar on the top
      if (tl.y > 0) {
        this.zoomTransform.f -= tl.y;
      }

      // do not allow for a black bar on the bottom
      if (br.y < height) {
        this.zoomTransform.f += height - br.y
      }
    } else {
      // center vertically
      this.zoomTransform.f = (height - height * this.zoomScale) / 2;
    }

    // transform the center point of the screen to the transformed image so we know what exactly
    // we are currently looking at.
    this.zoomLookingAt = this.zoomTransform.inverse().transformPoint({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2
    });

    this.zoomLookingAt.x -= width / 2 - widthOfImage / 2;
    this.zoomLookingAt.y -= height / 2 - heightOfImage / 2;
  }

  private zoomConfig() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // aspect ratio of image
    const aspect = this.currentAspectRatio;

    let widthOfImage: number;
    let heightOfImage: number;

    if (width / height < aspect) {
      widthOfImage = width;
      heightOfImage = widthOfImage / aspect;
    } else {
      heightOfImage = height;
      widthOfImage = heightOfImage * aspect;
    }

    return {width, height, widthOfImage, heightOfImage};
  }
}

function distanceTo(lhs: Pointer, rhs: Pointer): number {
  const dx = lhs.clientX - rhs.clientX;
  const dy = lhs.clientY - rhs.clientY;
  return Math.sqrt(dx * dx + dy * dy)
}

type Point = { x: number, y: number };

function midpoint(lhs: Pointer, rhs: Pointer): Point {
  return {
    x: (lhs.clientX + rhs.clientX) / 2,
    y: (lhs.clientY + rhs.clientY) / 2,
  }
}

function identity(): DOMMatrix {
  return new DOMMatrix([1, 0, 0, 1, 0, 0]);
}
