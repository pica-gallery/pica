import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Input,
  signal,
  type TrackByFunction
} from '@angular/core';
import type {Album} from '../../service/gallery';
import {chunksOf, columnCountSignal} from '../../util';
import {CdkVirtualForOf, CdkVirtualScrollableWindow, CdkVirtualScrollViewport} from '@angular/cdk/scrolling';
import {NgStyle} from '@angular/common';
import {ScrollingModule} from '@angular/cdk-experimental/scrolling';
import {AlbumListRowComponent} from '../album-list-row/album-list-row.component';
import {MyAutoSizeVirtualScroll} from '../../directives/auto-size-scrolling.directive';
import {ListViewComponent} from '../list-view/list-view.component';

@Component({
  selector: 'app-album-list',
  standalone: true,
  imports: [
    CdkVirtualScrollViewport,
    NgStyle,
    ScrollingModule,
    CdkVirtualScrollableWindow,
    AlbumListRowComponent,
    CdkVirtualForOf,
    MyAutoSizeVirtualScroll,
    ListViewComponent,
  ],
  templateUrl: './album-list.component.html',
  styleUrl: './album-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlbumListComponent {
  private readonly albumsSignal = signal<Album[] | undefined>(undefined);
  protected readonly columnCount = columnCountSignal(inject(ElementRef).nativeElement, 300);

  protected readonly state = computed(() => {
    let albums = this.albumsSignal();
    const columnCount = this.columnCount();

    if (!albums || !columnCount) {
      return null;
    }

    // sort albums by time desc
    albums = [...albums].sort((lhs, rhs) => {
      return rhs.timestamp.getTime() - lhs.timestamp.getTime();
    })

    let rowId = 0;

    return {
      columnCount,
      rows: chunksOf(albums, columnCount).map((albums, idx) => ({id: idx, albums}))
    };
  });

  trackByIndex: TrackByFunction<Album[]> = (idx: number) => idx;

  @Input()
  set albums(albums: Album[]) {
    this.albumsSignal.set(albums);
  }
}

