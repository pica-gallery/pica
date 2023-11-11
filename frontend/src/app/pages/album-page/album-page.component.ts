import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {CommonModule, DatePipe} from '@angular/common';
import {Image} from '../../service/api';
import {ImagesComponent} from '../../components/album/images.component';
import {Gallery} from '../../service/gallery';
import {ImageSwiperComponent} from '../../components/image-swiper/image-swiper.component';

@Component({
  selector: 'app-album-page',
  standalone: true,
  imports: [CommonModule, ImagesComponent, DatePipe, ImageSwiperComponent],
  templateUrl: './album-page.component.html',
  styleUrls: ['./album-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlbumPageComponent {
  private readonly gallery = inject(Gallery);

  protected imageToShow: Image | null = null;
  protected readonly album$ = this.gallery.album('$Camera');

  async imageClicked(image: Image) {
    this.imageToShow = image;
  }
}
