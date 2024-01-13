import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  Output,
  signal
} from '@angular/core';
import type {Album} from '../../service/gallery';
import {chunksOf, columnCountSignal} from '../../util';
import {CdkVirtualForOf, CdkVirtualScrollableWindow, CdkVirtualScrollViewport} from '@angular/cdk/scrolling';
import {NgStyle} from '@angular/common';
import {ScrollingModule} from '@angular/cdk-experimental/scrolling';
import {AlbumListRowComponent} from '../album-list-row/album-list-row.component';
import {MyAutoSizeVirtualScroll} from '../../directives/auto-size-scrolling.directive';
import {type ListItem, ListViewComponent, type SavedScroll} from '../list-view/list-view.component';
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
export class AlbumListComponent {
  private readonly albumsSignal = signal<Album[] | undefined>(undefined);
  private readonly showHeaderSignal = signal(true);
  protected readonly columnCount = columnCountSignal(inject(ElementRef).nativeElement, 300);

  protected readonly state = computed(() => {
    let albums = this.albumsSignal();
    const columnCount = this.columnCount();

    if (!albums || !columnCount) {
      return null;
    }

    const rows: ListItem[] = [];

    if (this.showHeaderSignal()) {
      rows.push({
        viewType: AlbumListHeaderComponent,
      })
    }

    rows.push(
      ...chunksOf(albums, columnCount).map((albums: Album[]): ListItem => {
        return {
          viewType: AlbumListRowComponent,
          inputs: {items: albums},
        };
      }),
    );

    const initialScroll = firstVisible != null
      ? firstVisible
      : null;

    return {columnCount, rows, initialScroll};
  });

  @Input()
  set albums(albums: Album[]) {
    this.albumsSignal.set(albums);
  }

  @Input({transform: booleanAttribute})
  set showHeader(show: boolean) {
    this.showHeaderSignal.set(show);
  }

  @Output()
  public readonly scrollChanged = new EventEmitter<SavedScroll>();
}

let firstVisible: number;
