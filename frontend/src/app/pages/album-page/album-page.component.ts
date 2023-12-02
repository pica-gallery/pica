import {ChangeDetectionStrategy, Component, ElementRef, inject, NgZone, signal} from '@angular/core';
import {CommonModule, DatePipe} from '@angular/common';
import {ImagesComponent} from '../../components/album/images.component';
import {Gallery, type MediaItem, type Section} from '../../service/gallery';
import {ImageSwiperComponent} from '../../components/image-swiper/image-swiper.component';
import {AlbumRowComponent} from '../../components/album-row/album-row.component';
import {CdkFixedSizeVirtualScroll, CdkVirtualForOf, CdkVirtualScrollViewport} from '@angular/cdk/scrolling';
import {combineLatestWith, distinctUntilChanged, map} from 'rxjs';
import {ScrollingModule} from '@angular/cdk-experimental/scrolling';
import type {MediaId} from '../../service/api';
import {enterNgZone, observeElementSize, type Size} from '../../util';
import {Router, RouterOutlet} from '@angular/router';

type SectionHeader = {
  name: string,
  timestamp: Date,
  mediaCount: number,
}

type RowState =
  | { type: 'header', header: SectionHeader }
  | { type: 'row', items: MediaItem[], columns: number }

type MediaToShowState = {
  items: MediaItem[],
  item: MediaId,
}

@Component({
  selector: 'app-album-page',
  standalone: true,
  imports: [CommonModule, DatePipe, AlbumRowComponent, CdkFixedSizeVirtualScroll, CdkVirtualForOf, CdkVirtualScrollViewport, ScrollingModule, RouterOutlet],
  templateUrl: './album-page.component.html',
  styleUrls: ['./album-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlbumPageComponent {
  private readonly gallery = inject(Gallery);
  private readonly router = inject(Router);

  protected mediaToShow = signal<MediaToShowState | null>(null);

  protected readonly columnCount$ = observeElementSize(inject(ElementRef).nativeElement).pipe(
    map((screenSize: Size): number => Math.ceil(screenSize.width / 120)),
    distinctUntilChanged(),
    enterNgZone(inject(NgZone)),
  );

  protected readonly items$ = this.gallery.stream().pipe(
    combineLatestWith(this.columnCount$),
    map(([stream, columnCount]) => {
      return stream.sections.flatMap((section => this.convertSection(section, columnCount)));
    }),
  )

  protected readonly allItems$ = this.gallery.stream().pipe(
    map(albums => albums.items),
  );

  protected clearMediaToShow() {
    this.mediaToShow.set(null);
  }

  protected async mediaClicked(item: MediaItem) {
    await this.router.navigate(['/stream/', item.id]);

    // this.mediaToShow.set({items: allItems, item: item.id})
  }

  private convertSection(section: Section, columnCount: number): RowState[] {
    const rows: RowState[] = [];

    rows.push({
      type: 'header', header: {
        name: section.name,
        timestamp: section.timestamp,
        mediaCount: section.items.length,
      },
    });

    const mediaItems = [...section.items];
    while (mediaItems.length > 0) {
      const chunk = mediaItems.splice(0, columnCount)
      rows.push({type: 'row', items: chunk, columns: columnCount});
    }

    return rows
  }
}
