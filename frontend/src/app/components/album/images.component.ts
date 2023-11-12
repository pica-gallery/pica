import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from '@angular/core';
import {CommonModule} from '@angular/common';
import {GridComponent} from '../grid/grid.component';
import {ThumbnailComponent} from '../thumbnail/thumbnail.component';
import {type MediaItemTo} from '../../service/api';
import type {MediaItem} from '../../service/gallery';

@Component({
  selector: 'app-album',
  standalone: true,
  imports: [CommonModule, GridComponent, ThumbnailComponent],
  templateUrl: './images.component.html',
  styleUrls: ['./images.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ImagesComponent {
  @Input({required: true})
  public items!: MediaItem[];

  @Output()
  public imageClicked = new EventEmitter<MediaItem>();
}
