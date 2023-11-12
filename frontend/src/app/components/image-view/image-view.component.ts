import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {CommonModule} from '@angular/common';
import type {MediaItem} from '../../service/gallery';

@Component({
  selector: 'app-image-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-view.component.html',
  styleUrls: ['./image-view.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ImageViewComponent {
  @Input({required: true})
  public media!: MediaItem;
}
