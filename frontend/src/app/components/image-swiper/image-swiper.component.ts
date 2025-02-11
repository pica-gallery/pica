import {
  type AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  type ElementRef,
  input,
  NgZone,
  type OnDestroy,
  output,
  signal,
  viewChild
} from '@angular/core';
import {CommonModule} from '@angular/common';
import type {MediaId} from '../../service/api';
import {ImageViewComponent} from '../image-view/image-view.component';
import type {MediaItem} from '../../service/gallery-client.service';
import {fromEvent} from 'rxjs';
import PointerTracker from 'pointer-tracker';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {observeElementSize} from '../../util';
import {Touch} from './touch';

type ViewItem = {
  id: MediaId,
  index: number,
  media: MediaItem,
  focus: boolean,
}

@Component({
    selector: 'app-image-swiper',
    imports: [CommonModule, ImageViewComponent],
    templateUrl: './image-swiper.component.html',
    styleUrls: ['./image-swiper.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ImageSwiperComponent implements AfterViewInit, OnDestroy {
  public readonly items = input.required<MediaItem[]>()

  public readonly mediaToShowOnInit = input<MediaId>();

  protected container = viewChild.required<ElementRef<HTMLElement>>("Container");

  protected readonly itemChanged = output<MediaItem>();
  protected readonly visibleItems = signal<ViewItem[]>([], {equal: itemsAreEqual})

  // initialized in ngAfterViewInit
  private tracker!: PointerTracker;

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly ngZone: NgZone,
  ) {
    effect(() => console.log('View items have changed:', this.visibleItems()));
  }

  ngAfterViewInit(): void {
    const container = this.container().nativeElement!;
    const containerWidth = container.getBoundingClientRect().width
    const containerHeight = container.getBoundingClientRect().height

    // jump to the selected image
    const mediaToShowOnInit = this.mediaToShowOnInit();
    const initialIndex = Math.max(0, this.items().findIndex(img => img.id === mediaToShowOnInit));
    const touch = new Touch(containerWidth, containerHeight, initialIndex);

    this.ngZone.runOutsideAngular(() => {
      // when an animation stops, we update the visibility
      container.addEventListener('transitionend', () => {
        touch.transitionEnd();
      })

      this.tracker = new PointerTracker(container, {
        // avoidPointerEvents: true,
        start: (pointer, _event) => touch.start(this.tracker, pointer),
        move: (previous, _changed, _event) => touch.move(this.tracker, previous),
        end: (pointer, _event, _cancelled) => touch.end(this.tracker, pointer),
      })

      observeElementSize(container)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(size => touch.onWindowResize(size))

      fromEvent<KeyboardEvent>(document, 'keydown')
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(event => this.handleKeyEvent(event, touch))

      const findCurrentChild = (idx: number): HTMLElement => {
        const media = this.items()[idx];

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
          console.log("Got event", event.type);

          switch (event.type) {
            case 'animateSwipe':
              console.info('Start animation to swipe target', event.transformX);
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

              const curr = this.items()[event.currentIndex];
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

    const allItems = this.items();
    for (let idx = 0; idx < allItems.length; idx++) {
      const visible = idx >= itemIndex - 5 && idx <= itemIndex + 5;
      if (!visible) {
        continue
      }

      const focus = idx >= itemIndex - 1 && idx <= itemIndex + 1;
      const media = allItems[idx];
      items.push({id: media.id, index: idx, media, focus})
    }

    this.visibleItems.set(items);

    this.itemChanged.emit(allItems[itemIndex]);
  }

  ngOnDestroy() {
    this.tracker.stop();
  }

  private handleKeyEvent(event: KeyboardEvent, touch: Touch) {
    if (event.defaultPrevented) {
      return;
    }

    switch (event.key) {
      case 'ArrowLeft':
        touch.animateToPrevious();
        event.preventDefault()
        break;

      case 'ArrowRight':
        touch.animateToNext();
        event.preventDefault();
        break;
    }
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
