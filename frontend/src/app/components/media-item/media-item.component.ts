import {ChangeDetectionStrategy, Component, computed, input} from '@angular/core';
import {ThumbnailComponent} from '../thumbnail/thumbnail.component';
import type {MediaItem} from '../../service/gallery-client.service';

@Component({
    selector: 'app-media-item',
    imports: [
        ThumbnailComponent,
    ],
    templateUrl: './media-item.component.html',
    styleUrl: './media-item.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        '[class.selected]': 'selected()',
    }
})
export class MediaItemComponent {
  public readonly media = input.required<MediaItem>();
  public readonly selected = input(false);

  protected readonly altText = computed(() => {
    let media = this.media();

    let text = media.name;

    if (media.location) {
      text += ` in ${media.location.city}, ${media.location.country}`
    }

    return text;
  })
}
