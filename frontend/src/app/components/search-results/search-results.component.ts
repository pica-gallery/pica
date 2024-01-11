import {ChangeDetectionStrategy, Component, Input, type Type, ViewChild} from '@angular/core';
import {type LayoutHelper, type ListItem, ListViewComponent} from '../list-view/list-view.component';
import type {ThumbnailComponent} from '../thumbnail/thumbnail.component';
import type {AlbumListItemComponent} from '../album-list-item/album-list-item.component';
import type {Album} from '../../service/gallery';

export type MediaListItem = ListItem & {
  component: Type<ThumbnailComponent>,
  id: unknown,
  inputs: {
    src: string,
  },
}

export type AlbumListItem = ListItem & {
  component: Type<AlbumListItemComponent>,
  id: unknown,
  inputs: {
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
    ListViewComponent
  ],
  templateUrl: './search-results.component.html',
  styleUrl: './search-results.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SearchResultsComponent {
  @Input()
  public set items(newItems: ResultListItem[]) {
    this.updateView(newItems);
  }

  @ViewChild(ListViewComponent)
  protected listView!: ListViewComponent;

  private async updateView(newItems: ResultListItem[]) {
    void this.listView?.postUpdate(newItems);
  }

  protected readonly layout = (helper: LayoutHelper): void => {
    const padding = 16;
    const columnCount = 2;


    const itemWidth = (window.innerWidth - padding * (columnCount + 1)) / columnCount;

    let idx = helper.anchorScroll.index & ~1;
    let nextTop = helper.anchorScroll.offsetY;

    outer: while (true) {
      let rowHeight = 0;

      for (let column = 0; column < columnCount; column++) {
        if (idx >= helper.itemCount) {
          break outer
        }

        if (nextTop > helper.offsetY + helper.height + helper.bufferSize) {
          break outer
        }

        const left = padding + column * (padding + itemWidth);

        const child = helper.getChild(idx);
        helper.layoutChild(child, left, nextTop);

        if (child.height > rowHeight) {
          rowHeight = child.height
        }

        idx++;
      }

      nextTop += rowHeight + padding;
    }

    idx = helper.anchorScroll.index & ~1;
    let prevTop = helper.anchorScroll.offsetY;

    outer: while (idx > 0) {
      let rowHeight = 0;

      for (let column = columnCount - 1; column >= 0; column--) {
        idx--;

        if (idx < 0) {
          break outer
        }

        if (prevTop < helper.offsetY - helper.bufferSize) {
          break outer
        }

        const left = padding + column * (padding + itemWidth);

        const child = helper.getChild(idx);
        helper.layoutChild(child, left, prevTop - child.height - padding);

        if (child.height > rowHeight) {
          rowHeight = child.height
        }
      }

      prevTop -= rowHeight + padding;
    }
  }
}


