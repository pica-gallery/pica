import {ChangeDetectionStrategy, Component, Input, signal} from '@angular/core';
import {CommonModule} from '@angular/common';
import type {MediaItem} from '../../service/gallery';
import {ProgressBarComponent} from '../progressbar/progress-bar.component';
import {BehaviorSubject, concatWith, distinctUntilChanged, filter, map, startWith, switchMap, timer} from 'rxjs';
import {toObservable} from '@angular/core/rxjs-interop';

export type VisibilityState = 'visible' | 'focus' | 'hidden'

@Component({
  selector: 'app-image-view',
  standalone: true,
  imports: [CommonModule, ProgressBarComponent],
  templateUrl: './image-view.component.html',
  styleUrls: ['./image-view.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ImageViewComponent {
  protected readonly visibleSignal = signal<VisibilityState>("hidden");

  private readonly loadedSubject = new BehaviorSubject(false);

  protected readonly loaderIsVisible$ = toObservable(this.visibleSignal).pipe(
    distinctUntilChanged(),
    filter(visible => visible === 'focus'),
    switchMap(value => {
      const notYetLoaded$ = this.loadedSubject.pipe(map(loaded => !loaded));

      return timer(250).pipe(
        startWith(false),
        concatWith(notYetLoaded$),
      )
    })
  )

  @Input({required: true})
  public media!: MediaItem;

  public updateVisibility(visible: VisibilityState) {
    if (this.visibleSignal() != visible) {
      this.loadedSubject.next(false);
      this.visibleSignal.set(visible);
    }
  }

  protected onImageLoad() {
    this.loadedSubject.next(true);
  }
}
