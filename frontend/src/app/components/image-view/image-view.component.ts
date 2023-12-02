import {ChangeDetectionStrategy, Component, Input, signal} from '@angular/core';
import {CommonModule} from '@angular/common';
import type {MediaItem} from '../../service/gallery';
import {ProgressBarComponent} from '../progressbar/progress-bar.component';
import {BehaviorSubject, concatWith, distinctUntilChanged, filter, map, startWith, switchMap, timer} from 'rxjs';
import {toObservable} from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-image-view',
  standalone: true,
  imports: [CommonModule, ProgressBarComponent],
  templateUrl: './image-view.component.html',
  styleUrls: ['./image-view.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ImageViewComponent {
  private readonly loadedSubject = new BehaviorSubject(false);
  protected readonly focusSignal = signal(false);

  protected readonly loaderIsVisible$ = toObservable(this.focusSignal).pipe(
    distinctUntilChanged(),
    filter(focus => focus),
    switchMap(() => {
      const notYetLoaded$ = this.loadedSubject.pipe(map(loaded => !loaded));

      return timer(250).pipe(
        startWith(false),
        concatWith(notYetLoaded$),
        distinctUntilChanged(),
      )
    })
  )

  @Input({required: true})
  public media!: MediaItem;

  @Input()
  public set focus(focus: boolean) {
    if (this.focusSignal() !== focus) {
      this.loadedSubject.next(false);
      this.focusSignal.set(focus);
    }
  }

  protected onImageLoad() {
    this.loadedSubject.next(true);
  }
}
