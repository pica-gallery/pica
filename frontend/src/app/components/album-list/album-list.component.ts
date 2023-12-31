import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Input,
  type OnDestroy,
  signal,
  ViewChild
} from '@angular/core';
import type {Album} from '../../service/gallery';
import {chunksOf, columnCountSignal} from '../../util';
import {CdkVirtualForOf, CdkVirtualScrollableWindow, CdkVirtualScrollViewport} from '@angular/cdk/scrolling';
import {NgStyle} from '@angular/common';
import {ScrollingModule} from '@angular/cdk-experimental/scrolling';
import {AlbumListRowComponent} from '../album-list-row/album-list-row.component';
import {MyAutoSizeVirtualScroll} from '../../directives/auto-size-scrolling.directive';
import {type ListItem, ListViewComponent} from '../list-view/list-view.component';
import {AlbumListHeaderComponent} from '../album-list-header/album-list-header.component';

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
export class AlbumListComponent implements OnDestroy {
  private readonly albumsSignal = signal<Album[] | undefined>(undefined);
  protected readonly columnCount = columnCountSignal(inject(ElementRef).nativeElement, 300);

  @ViewChild('ListView', {static: false})
  protected listView: ListViewComponent | null = null;

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

    const rows: ListItem[] = [];

    rows.push({
      component: AlbumListHeaderComponent,
    })

    rows.push(
      ...chunksOf(albums, columnCount).map((albums: Album[], idx: number): ListItem => {
        return {
          component: AlbumListRowComponent,
          inputs: {items: albums},
        };
      }),
    );

    const initialScroll = firstVisible != null
      ? [firstVisible, 0] as [number, number]
      : null;
    return {columnCount, rows, initialScroll};
  });

  @Input()
  set albums(albums: Album[]) {
    this.albumsSignal.set(albums);
  }

  ngOnDestroy() {
    if (this.listView) {
      firstVisible = this.listView.firstVisible;
    }
  }
}

let firstVisible: number;
