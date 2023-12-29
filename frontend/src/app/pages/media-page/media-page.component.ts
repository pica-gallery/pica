import {ChangeDetectionStrategy, Component, inject, Input, signal} from '@angular/core';
import {Gallery, type MediaItem} from '../../service/gallery';
import {map, type Observable} from 'rxjs';
import {AsyncPipe} from '@angular/common';
import {ImageSwiperComponent} from '../../components/image-swiper/image-swiper.component';
import type {AlbumId, MediaId} from '../../service/api';
import {IconComponent} from '../../components/icon/icon.component';
import {NavigationService} from '../../service/navigation';
import {ActivatedRoute, ActivatedRouteSnapshot} from '@angular/router';

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

  @Input()
  public mediaId!: MediaId;

  protected readonly items$: Observable<MediaItem[]>;

  constructor(
    private readonly navigationService: NavigationService,
    routeSnapshot: ActivatedRoute,
  ) {
    let albumId: AlbumId | null = null;

    for (const child of routeSnapshot.root.children) {
      if (child.outlet === 'primary') {
        const value = child.snapshot.params['albumId'] as unknown;
        if (typeof value === 'string') {
          albumId = value as AlbumId;
        }
      }
    }

    const gallery = inject(Gallery);
    this.items$ = albumId
      ? gallery.album(albumId).pipe(map(alb => alb.items))
      : gallery.stream().pipe(map(stream => stream.items));
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
