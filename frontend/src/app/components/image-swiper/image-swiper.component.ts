import {
  type AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  NgZone,
  type OnDestroy,
  QueryList,
  ViewChild,
  ViewChildren
} from '@angular/core';
import {CommonModule} from '@angular/common';
import type {MediaId} from '../../service/api';
import {ImageViewComponent, type VisibilityState} from '../image-view/image-view.component';
import type {MediaItem} from '../../service/gallery';
import {asyncScheduler, distinctUntilChanged, observeOn, ReplaySubject} from 'rxjs';
import {enterNgZone} from '../../util'

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
  public imageToShow: MediaId | null = null;

  @ViewChild('Container')
  protected container!: ElementRef<HTMLElement>;

  @ViewChildren(ImageViewComponent)
  protected imageViews!: QueryList<ImageViewComponent>;

  private readonly currentItemSubject = new ReplaySubject<MediaItem>(1);

  protected readonly currentItem$ = this.currentItemSubject.pipe(
    observeOn(asyncScheduler),
    distinctUntilChanged(),
    enterNgZone(this.ngZone),
  )

  constructor(private readonly ngZone: NgZone) {
  }

  ngAfterViewInit(): void {
    const container = this.container.nativeElement!;

    // jump to the selected image
    let currentIdx = Math.max(0, this.items.findIndex(img => img.id === this.imageToShow));

    const updateVisibility = () => {
      this.ngZone.run(() => {
        console.info('Update visibility of images.');
        for (let i = 0; i < this.items.length; i++) {
          const focus = i >= currentIdx - 1 && i <= currentIdx + 1;
          const visible = i >= currentIdx - 5 && i <= currentIdx + 5;

          const state: VisibilityState = focus ? 'focus' : visible ? 'visible' : 'hidden'
          this.imageViews.get(i)?.updateVisibility(state);
        }
      });
    }

    // when an animation stops, we update the visibility
    container.addEventListener('transitionend', () => {
      updateVisibility();
      container.classList.remove('animate');
    })

    this.currentItemSubject.next(this.items[currentIdx]);

    this.ngZone.runOutsideAngular(() => {
      let translateX = 0;
      let touchStartTranslateX = 0;
      let touchStartX: number | null = null;
      let touchPreviousX: number = 0;
      let flingTo: number = 0;

      let state: 'undecided' | 'scroll-x' | 'zooming' = 'undecided';

      type Point = { x: number, y: number };

      let p1: Point | null = null;
      let p2: Point | null = null;

      let isZoomedIn = false;

      let baseScale = 1;

      // and actually display it
      translateX = currentIdx * window.innerWidth;

      const applyTranslation = () => {
        container.style.transform = `translateX(${-translateX}px)`;
      };

      window.addEventListener('resize', () => {
        // ensure we are correctly positioned
        translateX = currentIdx * window.innerWidth;
        applyTranslation();
      })

      updateVisibility();
      applyTranslation();

      this.container.nativeElement.addEventListener('touchstart', event => {
        event.preventDefault();

        if (state !== 'undecided') {
          console.info('Gesture already in progress:', state)
          return;
        }

        console.info('Start touch at', Array.from(event.touches));

        if (event.touches.length === 1) {
          // maybe we want to start a scroll
          touchStartX = event.touches[0].clientX;
          touchPreviousX = touchStartX;
          touchStartTranslateX = translateX;
        }

        if (event.touches.length === 2) {
          // start a zoom gesture
          p1 = {x: event.touches[0].clientX, y: event.touches[0].screenY};
          p2 = {x: event.touches[1].clientX, y: event.touches[1].screenY};
        }

        container.classList.remove('animate')
      });

      this.container.nativeElement.addEventListener('touchmove', event => {
        const curX = event.touches[0].clientX;

        if (p1 && p2) {
          const dX = p1.x - p2.x;
          const dY = p1.y - p2.y;
          const initial = Math.sqrt(dX * dX + dY * dY);

          const cp1 = {x: event.touches[0].clientX, y: event.touches[0].screenY};
          const cp2 = {x: event.touches[1].clientX, y: event.touches[1].screenY};
          const cdX = cp1.x - cp2.x;
          const cdY = cp1.y - cp2.y;
          const current = Math.sqrt(cdX * cdX + cdY * cdY);

          const node = container.children.item(currentIdx) as HTMLElement;
          if (Math.abs(current - initial) > 8 && state === 'undecided') {
            state = 'zooming';
            baseScale = ((node as any).baseScale ?? 1) as number;
          }

          if (state === 'zooming') {
            const scale = Math.min(Math.max(1, baseScale * current / initial), 8);
            (node as any).baseScale = scale;
            node.style.transform = `scale(${scale})`;
            isZoomedIn = scale > 1;
          }

        } else if (touchStartX != null && !isZoomedIn) {
          const deltaX = Math.abs(touchStartX - curX);
          if (deltaX > 8 && state === 'undecided') {
            state = 'scroll-x';
          }

          if (state === 'scroll-x') {
            translateX = Math.max(0, touchStartTranslateX + (touchStartX - curX));
            applyTranslation();
          }

          if (Math.abs(curX - touchPreviousX) > 2) {
            flingTo = Math.sign(touchPreviousX - curX);
          } else {
            flingTo = 0;
          }

          touchPreviousX = curX;
        }
      });

      let touchend = (event: TouchEvent) => {
        if (state === 'scroll-x') {
          if (flingTo) {
            console.log('Fling', flingTo);
            currentIdx = Math.max(0, currentIdx + flingTo);
            flingTo = 0;
          } else {
            currentIdx = Math.floor((translateX + window.innerWidth / 2) / window.innerWidth);
          }

          console.info(`Current translation is ${translateX}, mapping to index ${currentIdx}");`);

          translateX = currentIdx * window.innerWidth;
          container.classList.add('animate')
          applyTranslation();
        }

        if (state === 'undecided' && touchStartX != null) {
          let updated = false;

          const pos = touchStartX / window.innerWidth;

          if (pos < 0.33 && currentIdx > 0) {
            currentIdx--;
            updated = true;
          }

          if (pos > 0.66) {
            currentIdx++;
            updated = true;
          }

          if (updated) {
            translateX = currentIdx * window.innerWidth;
            container.classList.add('animate')
            applyTranslation();
          }
        }

        touchStartX = null;
        p1 = p2 = null;

        this.currentItemSubject.next(this.items[currentIdx])

        state = 'undecided';
      };

      this.container.nativeElement.addEventListener('touchend', touchend);
      this.container.nativeElement.addEventListener('touchcancel', touchend);
    });
  }

  ngOnDestroy() {
    // this.io.unobserve(this.element.nativeElement)
  }
}
