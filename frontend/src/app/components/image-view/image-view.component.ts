import {ChangeDetectionStrategy, Component, computed, effect, input, signal} from '@angular/core';
import {CommonModule} from '@angular/common';
import type {MediaItem} from '../../service/gallery-client.service';
import {ProgressBarComponent} from '../progressbar/progress-bar.component';
import {concatWith, map, startWith, timer} from 'rxjs';
import {derivedAsync} from 'ngxtension/derived-async';
import {toObservable} from '@angular/core/rxjs-interop';

@Component({
    selector: 'app-image-view',
    imports: [CommonModule, ProgressBarComponent],
    templateUrl: './image-view.component.html',
    styleUrls: ['./image-view.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        '[style.--aspect-ratio]': 'aspectRatioValue()'
    }
})
export class ImageViewComponent {
  private readonly loaded = signal(false);
  private readonly notYetLoaded$ = toObservable(this.loaded).pipe(map(loaded => !loaded));

  public readonly media = input.required<MediaItem>({alias: 'media'});
  public readonly focus = input(false);

  protected readonly loaderIsVisible = derivedAsync(() => {
    if (this.focus()) {
      return timer(250).pipe(
        startWith(false),
        concatWith(this.notYetLoaded$),
      )
    }

    return false;
  })

  protected readonly aspectRatioValue = computed(() => {
    return this.media().width / this.media().height
  })

  constructor() {
    effect(() => {
      // if we unfocus, we need to mark the image as not loaded again,
      // was we might need to re-load the image the next time we focus it again
      if (!this.focus()) {
        this.loaded.set(false);
      }
    }, {allowSignalWrites: true});
  }

  protected onImageLoad() {
    this.loaded.set(true);
  }
}
