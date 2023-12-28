import {ChangeDetectionStrategy, Component, computed, Input, signal} from '@angular/core';
import type {Album} from '../../service/gallery';
import {AlbumListItemComponent} from '../album-list-item/album-list-item.component';
import {AlbumRowComponent} from '../album-row/album-row.component';
import {
  CdkFixedSizeVirtualScroll,
  CdkVirtualForOf,
  CdkVirtualScrollableWindow,
  CdkVirtualScrollViewport
} from '@angular/cdk/scrolling';
import {DatePipe} from '@angular/common';
import {ScrollingModule} from '@angular/cdk-experimental/scrolling';

@Component({
  selector: 'app-album-list',
  standalone: true,
  imports: [
    AlbumListItemComponent,
    AlbumRowComponent,
    CdkFixedSizeVirtualScroll,
    CdkVirtualForOf,
    CdkVirtualScrollViewport,
    CdkVirtualScrollableWindow,
    DatePipe,
    ScrollingModule
  ],
  templateUrl: './album-list.component.html',
  styleUrl: './album-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlbumListComponent {
  private readonly albumsSignal = signal<Album[]>([]);

  protected readonly rows = computed(() => {
    const columnCount = 2;
    const rows = [];

    const rest = [...this.albumsSignal()];

    // sort albums by time desc
    rest.sort((lhs, rhs) => {
      return rhs.timestamp.getTime() - lhs.timestamp.getTime();
    })

    while (rest.length > 0) {
      rows.push(rest.splice(0, columnCount));
    }

    return rows;
  });

  @Input()
  set albums(albums: Album[]) {
    this.albumsSignal.set(albums);
  }
}
