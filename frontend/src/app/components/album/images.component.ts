import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from '@angular/core';
import {CommonModule} from '@angular/common';
import {GridComponent} from '../grid/grid.component';
import {ThumbnailComponent} from '../thumbnail/thumbnail.component';
import {Image} from '../../service/api';

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
  public images!: Image[];

  @Output()
  public imageClicked = new EventEmitter<Image>();

  protected trackByImageId = (_idx: number, image: Image) => image.id

  protected thumbOf(image: Image): string {
    return `/thumbs/${encodeURIComponent(image.id)}`
  }
}
