import {ChangeDetectionStrategy, Component, computed, input, linkedSignal} from '@angular/core';

import type {MediaItem} from '../../service/gallery-client.service';
import {ProgressBarComponent} from '../progressbar/progress-bar.component';
import {concatWith, map, startWith, timer} from 'rxjs';
import {derivedAsync} from 'ngxtension/derived-async';
import {toObservable} from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-image-view',
  imports: [ProgressBarComponent],
  templateUrl: './image-view.component.html',
  styleUrls: ['./image-view.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.--aspect-ratio]': 'aspectRatioValue()'
  }
})
export class ImageViewComponent {
  public readonly media = input.required<MediaItem>({alias: 'media'});
  public readonly focus = input(false);

  // if we unfocus, we need to mark the image as not loaded again,
  // as we might need to re-load the image the next time we focus it again
  private readonly loaded = linkedSignal<boolean, boolean>({
    source: this.focus,
    computation: (focus, previous) => {
      const previousValue = previous?.value ?? false;
      return !focus ? false : previousValue
    },
  })

  private readonly notYetLoaded$ = toObservable(this.loaded).pipe(map(loaded => !loaded));

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

  protected onImageLoad() {
    this.loaded.set(true);
  }
}
