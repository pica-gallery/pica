import {ChangeDetectionStrategy, Component, inject, Input, signal} from '@angular/core';
import {Gallery, type MediaItem} from '../../service/gallery';
import {map} from 'rxjs';
import {AsyncPipe} from '@angular/common';
import {ImageSwiperComponent} from '../../components/image-swiper/image-swiper.component';
import type {MediaId} from '../../service/api';
import {IconComponent} from '../../components/icon/icon.component';
import {NavigationService} from '../../service/navigation';

@Component({
  selector: 'app-media-page',
  standalone: true,
  imports: [AsyncPipe, ImageSwiperComponent, IconComponent],
  templateUrl: './media-page.component.html',
  styleUrl: './media-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MediaPageComponent {
  protected readonly currentItem = signal<MediaItem | null>(null);

  protected readonly items$ = inject(Gallery).stream().pipe(
    map(stream => stream.items),
  )

  @Input()
  public mediaId!: MediaId;

  constructor(private readonly navigationService: NavigationService) {
  }

  protected close() {
    // drop the open media from url
    void this.navigationService.clearMediaViewer();
  }

  protected itemChanged(item: MediaItem) {
    this.currentItem.set(item);

    // replace url, but let back still go to the previous page
    void this.navigationService.mediaViewer(item.id, true);
  }
}
