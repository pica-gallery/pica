import {ChangeDetectionStrategy, Component, inject, Input, signal} from '@angular/core';
import {Gallery, type MediaItem} from '../../service/gallery';
import {map, type Observable} from 'rxjs';
import {AsyncPipe} from '@angular/common';
import {ImageSwiperComponent} from '../../components/image-swiper/image-swiper.component';
import type {AlbumId, MediaId} from '../../service/api';
import {IconComponent} from '../../components/icon/icon.component';
import {NavigationService} from '../../service/navigation';
import {ActivatedRoute} from '@angular/router';
import {ExifDialogComponent} from '../../components/exif-dialog/exif-dialog.component';
import {BottomSheetComponent} from '../../components/bottom-sheet/bottom-sheet.component';
import {iterActivatedRoute} from '../../util/utils';

@Component({
  selector: 'app-media-page',
  standalone: true,
  imports: [AsyncPipe, ImageSwiperComponent, IconComponent, BottomSheetComponent, ExifDialogComponent],
  templateUrl: './media-page.component.html',
  styleUrl: './media-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MediaPageComponent {
  protected readonly currentItem = signal<MediaItem | null>(null);
  protected readonly exifViewerMediaId = signal<MediaId | null>(null);

  @Input()
  public mediaId!: MediaId;

  protected readonly items$: Observable<MediaItem[]>;

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

    const gallery = inject(Gallery);
    this.items$ = albumId
      ? gallery.album(albumId).pipe(map(alb => alb.items))
      : gallery.stream().pipe(map(stream => stream.items));
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
