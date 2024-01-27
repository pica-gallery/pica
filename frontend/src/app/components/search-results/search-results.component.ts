import {ChangeDetectionStrategy, Component, EventEmitter, inject, Input, Output, ViewChild} from '@angular/core';
import {
  type ListItem,
  ListViewComponent,
  ListViewItemDirective,
  type SavedScroll
} from '../list-view/list-view.component';
import {AlbumListItemComponent} from '../album-list-item/album-list-item.component';
import type {Album, MediaItem} from '../../service/gallery';
import {ArrayDataSource} from '../list-view/datasource';
import {MediaItemComponent} from '../media-item/media-item.component';
import {gridLayout} from '../../layouts';
import {NavigationService} from '../../service/navigation';

export type MediaListItem = ListItem & {
  id: unknown,
  viewType: 'Media',
  context: {
    src: string,
    album: Album,
    media: MediaItem,
  },
}

export type AlbumListItem = ListItem & {
  id: unknown,
  viewType: 'Album',
  context: {
    album: Album,
  },
}

export type ResultListItem =
  | MediaListItem
  | AlbumListItem
  ;


@Component({
  selector: 'app-search-results',
  standalone: true,
  imports: [
    ListViewComponent,
    ListViewItemDirective,
    MediaItemComponent,
    AlbumListItemComponent
  ],
  templateUrl: './search-results.component.html',
  styleUrl: './search-results.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SearchResultsComponent {
  private readonly navigation = inject(NavigationService);

  protected readonly dataSource = new ArrayDataSource<ResultListItem>(null && {
    sameItem(lhs: ResultListItem, rhs: ResultListItem): boolean {
      return lhs.id === rhs.id;
    },

    sameContents(lhs: ResultListItem, rhs: ResultListItem): boolean {
      return true;
    },
  });

  @Input()
  public set items(newItems: ResultListItem[]) {
    this.dataSource.items = newItems
  }

  @Input()
  public initialScrollState: SavedScroll | null = null;

  @Output()
  public readonly scrollChanged = new EventEmitter<SavedScroll>();

  @ViewChild(ListViewComponent)
  protected listView!: ListViewComponent;

  protected readonly layout = gridLayout({
    maxColumnWidth: 200,
    gapX: 16,
    gapY: 16,
  });

  protected async mediaClicked(album: Album, media: MediaItem) {
    await this.navigation.mediaViewerInAlbum(album.id, media.id)
  }
}
