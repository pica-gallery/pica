import {ChangeDetectionStrategy, Component, Input, ViewChild} from '@angular/core';
import {type ListItem, ListViewComponent, ListViewItemDirective} from '../list-view/list-view.component';
import {ThumbnailComponent} from '../thumbnail/thumbnail.component';
import {AlbumListItemComponent} from '../album-list-item/album-list-item.component';
import type {Album, MediaItem} from '../../service/gallery';
import {ArrayDataSource} from '../list-view/datasource';
import {MediaItemComponent} from '../media-item/media-item.component';
import {gridLayout} from '../../layouts';

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

  @ViewChild(ListViewComponent)
  protected listView!: ListViewComponent;

  protected readonly layout = gridLayout({
    maxColumnWidth: 200,
    gapX: 16,
    gapY: 16,
  });
}
