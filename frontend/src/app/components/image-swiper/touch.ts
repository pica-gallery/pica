import {EventEmitter} from '@angular/core';
import PointerTracker, {type Pointer} from 'pointer-tracker';
import type {Size} from '../../util';

type TouchState =
  | 'blocked'
  | 'undecided'
  | 'zooming'
  | 'swiping-horizontal'
  | 'swiping-vertical'

export type AnimationEvent =
  | { type: 'animateSwipe', transformX: number }
  | { type: 'applySwipeTransform', transformX: number }
  | { type: 'applyZoomTransform', currentIndex: number, transform: DOMMatrix }
  | { type: 'animateZoomTransform', currentIndex: number, transform: DOMMatrix }
  | { type: 'updateCurrent', currentIndex: number }
  | { type: 'stopAnimation' }

type ClickArea =
  | 'prev'
  | 'next'

export class Touch {
  private state: TouchState = 'undecided';

  private zoomTransform: DOMMatrix = identity();
  private zoomLookingAt: Point = {x: 0, y: 0};

  // both values are always negative
  private swipeTranslateXStart: number = 0;
  private swipeTranslateX: number = 0;
  private swipeFlingTo: number = 0;

  public readonly events = new EventEmitter<AnimationEvent>();

  public currentAspectRatio: number = 1;
  private scheduleAnimateTo: number | null = null;

  constructor(
    private containerWidth: number,
    private containerHeight: number,
    private idxCurrent: number,
    private itemCount: number,
  ) {
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

    if (pointerCount(this.state) === 1 && tracker.currentPointers.length >= 1) {
      // only track the first pointer
      return false;
    }

    // in general, track at most two pointers
    return tracker.currentPointers.length < 2;
  }

  move(tracker: PointerTracker, previous: Pointer[]): void {
    if (this.state === 'undecided') {
      const newState = this.tryCommitToState(tracker);
      if (newState == null) {
        return;
      }

      console.info('Comitted to state:', this.state);

      if (newState === 'swiping-horizontal') {
        this.swipeTranslateXStart = this.swipeXOfIndex(this.idxCurrent);
      }
    }

    const initial = tracker.startPointers;
    const current = tracker.currentPointers;

    if (this.state === 'swiping-horizontal') {
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

    if (this.state === 'swiping-horizontal') {
      const targetIndex = this.swipeFlingTo
        ? this.idxCurrent + this.swipeFlingTo
        : this.indexOfSwipeX(this.swipeTranslateX);

      this.swipeFlingTo = 0;
      this.animateToInner(targetIndex);
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

    if (this.state === 'undecided') {
      if (this.inClickArea(pointer.clientX, 'prev')) {
        this.animateToPrevious()
        return;
      }

      if (this.inClickArea(pointer.clientX, 'next')) {
        this.animateToNext();
        return
      }
    }

    this.state = 'undecided';
  }

  private inClickArea(mouseX: number, area: ClickArea): boolean {
    const areaWidth = 0.25;
    return area === 'prev' && mouseX < this.containerWidth * areaWidth
      || area === 'next' && mouseX > this.containerWidth * (1 - areaWidth);
  }

  animateToNext() {
    this.animateTo(this.idxCurrent + 1)
  }

  animateToPrevious() {
    this.animateTo(this.idxCurrent - 1);
  }

  private animateTo(targetIndex: number) {
    if (this.state !== 'undecided') {
      console.log('Schedule animation to', targetIndex);
      this.scheduleAnimateTo = targetIndex;
      return
    }

    this.animateToInner(targetIndex);
  }

  private animateToInner(targetIndex: number) {
    targetIndex = this.clampTargetIndex(targetIndex);

    console.debug('Animate to', targetIndex);
    this.idxCurrent = targetIndex;

    this.events.emit({
      type: 'animateSwipe',
      transformX: this.swipeXOfIndex(targetIndex),
    })

    // block input until animation finishes
    this.state = 'blocked';
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

    if (this.state === 'undecided' && this.scheduleAnimateTo != null) {
      this.animateToInner(this.scheduleAnimateTo);
      this.scheduleAnimateTo = null;
    }
  }

  public onWindowResize(size: Size) {
    this.containerWidth = size.width;
    this.containerHeight = size.height;

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
    return this.containerWidth + 16;
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
      // we have one pointer.
      const dx = current[0].clientX - initial[0].clientX;
      const dy = current[0].clientY - initial[0].clientY;

      // if it moved at least 16px on x axis (and less than 16 on y axis),
      // we have a swipe
      if (Math.abs(dx) > 16 && Math.abs(dy) < 16) {
        return this.state = 'swiping-horizontal';
      }

      // check for vertical swipe too
      if (Math.abs(dx) < 16 && Math.abs(dy) > 16) {
        return this.state = 'swiping-vertical';
      }
    }

    return null;
  }

  private clampTargetIndex(targetIndex: number): number {
    return Math.max(0, Math.min(targetIndex, this.itemCount - 1));
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
      x: this.containerWidth / 2,
      y: this.containerHeight / 2
    });

    this.zoomLookingAt.x -= width / 2 - widthOfImage / 2;
    this.zoomLookingAt.y -= height / 2 - heightOfImage / 2;
  }

  private zoomConfig() {
    const width = this.containerWidth;
    const height = this.containerHeight;

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

function pointerCount(state: TouchState): number | undefined {
  if (state === 'swiping-horizontal' || state === 'swiping-vertical') {
    return 1
  }

  if (state === 'zooming') {
    return 2
  }

  return;
}
