import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from '@angular/core';
import {ThumbnailComponent} from '../thumbnail/thumbnail.component';
import type {MediaItem} from '../../service/gallery';

@Component({
  selector: 'app-album-row',
  standalone: true,
  imports: [
    ThumbnailComponent
  ],
  templateUrl: './album-row.component.html',
  styleUrl: './album-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlbumRowComponent {
  @Input({required: true})
  public items!: MediaItem[]

  @Output()
  public mediaClicked = new EventEmitter<MediaItem>();
}
