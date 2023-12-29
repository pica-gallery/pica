import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Input,
  NgZone,
  signal,
  type TrackByFunction
} from '@angular/core';
import type {Album} from '../../service/gallery';
import {toSignal} from '@angular/core/rxjs-interop';
import {chunksOf, columnCount$} from '../../util';
import {CdkVirtualForOf, CdkVirtualScrollableWindow, CdkVirtualScrollViewport} from '@angular/cdk/scrolling';
import {NgStyle} from '@angular/common';
import {ScrollingModule} from '@angular/cdk-experimental/scrolling';
import {AlbumListRowComponent} from '../album-list-row/album-list-row.component';
import {MyAutoSizeVirtualScroll} from '../../directives/auto-size-scrolling.directive';

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
  ],
  templateUrl: './album-list.component.html',
  styleUrl: './album-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlbumListComponent {
  private readonly albumsSignal = signal<Album[]>([]);

  protected readonly columnCount = toSignal(
    columnCount$(inject(ElementRef).nativeElement, inject(NgZone), 300),
  );

  protected readonly rows = computed(() => {
    const albums = [...this.albumsSignal()];

    // sort albums by time desc
    albums.sort((lhs, rhs) => {
      return rhs.timestamp.getTime() - lhs.timestamp.getTime();
    })

    const columnCount = this.columnCount() || 2;

    return {
      columnCount,
      rows: chunksOf(albums, columnCount)
    };
  });

  trackByIndex: TrackByFunction<Album[]> = (idx: number) => idx;

  @Input()
  set albums(albums: Album[]) {
    this.albumsSignal.set(albums);
  }
}
