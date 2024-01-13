import {ChangeDetectionStrategy, Component, inject, Input, ViewChild} from '@angular/core';
import {
  type Child,
  type LayoutHelper,
  type ListItem,
  ListViewComponent,
  ListViewItemDirective
} from '../list-view/list-view.component';
import {ThumbnailComponent} from '../thumbnail/thumbnail.component';
import {AlbumListItemComponent} from '../album-list-item/album-list-item.component';
import type {Album, MediaItem} from '../../service/gallery';
import {ArrayDataSource} from '../list-view/datasource';
import {NavigationService} from '../../service/navigation';
import {columnCount} from '../../util';

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
    ThumbnailComponent,
    AlbumListItemComponent,
  ],
  templateUrl: './search-results.component.html',
  styleUrl: './search-results.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SearchResultsComponent {
  private readonly navigationService = inject(NavigationService);
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

  protected readonly layout = columnsLayout;

  albumClicked(album: Album) {
    void this.navigationService.openAlbum(album.id)
  }

  mediaClicked(album: Album, media: MediaItem) {
    void this.navigationService.mediaViewerInAlbum(album.id, media.id)
  }
}


function columnsLayout(helper: LayoutHelper): void {
  const padding = 16;
  const columns = columnCount(window.innerWidth - 2 * padding, 200);

  const itemWidth = (window.innerWidth - padding * (columns + 1)) / columns;
  const anchorIdx = ((helper.anchorScroll.index / columns) | 0) * columns;

  let idx = anchorIdx;
  let nextTop = helper.anchorScroll.offsetY;

  outer: while (true) {
    let rowHeight = 0;

    for (let column = 0; column < columns; column++) {
      if (idx >= helper.itemCount) {
        break outer
      }

      if (nextTop > helper.offsetY + helper.height + helper.bufferSize) {
        break outer
      }

      const left = padding + column * (padding + itemWidth);

      const child = helper.getChild(idx, {width: itemWidth + 'px'});
      helper.layoutChild(child, left, nextTop);

      if (child.height > rowHeight) {
        rowHeight = child.height
      }

      idx++;
    }

    nextTop += rowHeight + padding;
  }

  idx = anchorIdx;
  let prevTop = helper.anchorScroll.offsetY;

  outer: while (idx > 0) {
    let rowHeight = 0;

    let pending: { child: Child, left: number }[] = [];
    for (let column = columns - 1; column >= 0; column--) {
      idx--;

      if (idx < 0) {
        break outer
      }

      if (prevTop < helper.offsetY - helper.bufferSize) {
        break outer
      }

      const left = padding + column * (padding + itemWidth);
      const child = helper.getChild(idx, {width: itemWidth + 'px'});
      pending.push({child, left})

      if (child.height > rowHeight) {
        rowHeight = child.height
      }
    }

    for (const p of pending) {
      helper.layoutChild(p.child, p.left, prevTop - rowHeight - padding);
    }

    prevTop -= rowHeight + padding;
  }
}
