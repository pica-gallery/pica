import {ChangeDetectionStrategy, Component, computed, inject, input, type Signal, signal} from '@angular/core';
import {type MediaItem} from '../../service/gallery-client.service';
import {ImageSwiperComponent} from '../../components/image-swiper/image-swiper.component';
import type {AlbumId, MediaId} from '../../service/api';
import {IconComponent} from '../../components/icon/icon.component';
import {NavigationService} from '../../service/navigation';
import {ActivatedRoute} from '@angular/router';
import {ExifDialogComponent} from '../../components/exif-dialog/exif-dialog.component';
import {BottomSheetComponent} from '../../components/bottom-sheet/bottom-sheet.component';
import {iterActivatedRoute} from '../../util/utils';
import {StreamStore} from '../../service/stream.store';
import {AlbumStore} from '../../service/album.store';
import {mapSuccess, type State} from '../../util';
import {TopBarComponent} from '../../components/topbar/top-bar.component';

@Component({
    selector: 'app-media-page',
  imports: [ImageSwiperComponent, IconComponent, BottomSheetComponent, ExifDialogComponent, TopBarComponent],
    templateUrl: './media-page.component.html',
    styleUrl: './media-page.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MediaPageComponent {
  protected readonly currentItem = signal<MediaItem | null>(null);
  protected readonly exifViewerMediaId = signal<MediaId | null>(null);

  public readonly mediaId = input<MediaId>();

  protected readonly items: Signal<State<MediaItem[]>>;

  constructor(
    private readonly navigationService: NavigationService,
    routeSnapshot: ActivatedRoute,
  ) {
    let albumId: AlbumId | null = null;

    for (const child of iterActivatedRoute(routeSnapshot.root)) {
      if (child.outlet === 'primary') {
        const value = child.snapshot.params['albumId'] as unknown;
        if (typeof value === 'string') {
          albumId = value as AlbumId;
        }
      }
    }

    const streamStore = inject(StreamStore);

    if (albumId) {
      const albumStore = inject(AlbumStore);
      this.items = computed(() => {
        return mapSuccess(
          albumStore.byId(albumId),
          album => album.items,
        );
      });
    } else {
      const streamStore = inject(StreamStore);
      this.items = streamStore.items
    }
  }

  protected close() {
    void this.navigationService.up();

    // drop the open media from url
    // void this.navigationService.clearMediaViewer();
  }

  protected itemChanged(item: MediaItem) {
    this.currentItem.set(item);

    // replace url, but let back still go to the previous page
    void this.navigationService.mediaUpdate(item.id);
  }

  protected showExifViewer() {
    if (this.exifViewerMediaId() != null) {
      this.exifViewerMediaId.set(null);
      return;
    }

    const mediaId = this.currentItem()?.id;
    if (mediaId != null) {
      this.exifViewerMediaId.set(mediaId);
    }
  }

  protected closeExifViewer() {
    this.exifViewerMediaId.set(null);
  }
}
