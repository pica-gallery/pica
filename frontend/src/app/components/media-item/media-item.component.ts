import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
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
  @Input({required: true})
  public media!: MediaItem;

  protected get altText(): string {
    let text = this.media.name;

    if (this.media.location) {
      text += ` in ${this.media.location.city}, ${this.media.location.country}`
    }

    return text;
  }
}
