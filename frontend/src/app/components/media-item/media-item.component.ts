import {ChangeDetectionStrategy, Component, computed, input} from '@angular/core';
import {ThumbnailComponent} from '../thumbnail/thumbnail.component';
import type {MediaItem} from '../../service/gallery';

@Component({
  selector: 'app-media-item',
  standalone: true,
  imports: [
    ThumbnailComponent,
  ],
  templateUrl: './media-item.component.html',
  styleUrl: './media-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MediaItemComponent {
  public readonly media = input.required<MediaItem>();

  protected readonly altText = computed(() => {
    let media = this.media();

    let text = media.name;

    if (media.location) {
      text += ` in ${media.location.city}, ${media.location.country}`
    }

    return text;
  })
}
