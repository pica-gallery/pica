import {
  ChangeDetectionStrategy,
  Component,
  computed,
  EventEmitter,
  input,
  Output,
  type TemplateRef,
  ViewChild
} from '@angular/core';
import type {MediaItem, Section} from '../../service/gallery';
import {
  type Child,
  type LayoutHelper,
  type ListItem,
  ListViewComponent,
  ListViewItemDirective,
  type SavedScroll
} from '../list-view/list-view.component';
import {type SectionHeader, SectionHeaderComponent} from '../section-title/section-header.component';
import {MediaItemComponent} from '../media-item/media-item.component';
import {columnCount} from '../../util';

type SectionHeaderListItem = ListItem & {
  viewType: 'SectionHeader',
  context: { header: SectionHeader },
}

type ThumbnailsListItem = ListItem & {
  viewType: 'MediaItem',
  context: { media: MediaItem },
  mediaIdx: number,
}

type RowListItem =
  | SectionHeaderListItem
  | ThumbnailsListItem

@Component({
  selector: 'app-album',
  standalone: true,
  imports: [
    SectionHeaderComponent,
    ListViewComponent,
    MediaItemComponent,
    ListViewItemDirective,
  ],
  templateUrl: './album.component.html',
  styleUrls: ['./album.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlbumComponent {
  public readonly sections = input.required<Section[]>();

  @Output()
  readonly mediaClicked = new EventEmitter<MediaItem>();

  @Output()
  readonly scrollChanged = new EventEmitter<SavedScroll>();

  @ViewChild('MediaItem')
  protected readonly mediaItemTemplate!: TemplateRef<unknown>;

  protected readonly layout = columnsLayout;

  protected readonly items = computed(() => {
    const convertSection = (section: Section): RowListItem[] => {
      const rows: RowListItem[] = [];

      rows.push({
        viewType: 'SectionHeader',
        context: {
          header: {
            name: section.name,
            timestamp: section.timestamp,
            mediaCount: section.items.length,
            location: section.location,
          }
        }
      });

      rows.push(...section.items.map((media, mediaIdx: number): ThumbnailsListItem => {
        return {
          viewType: 'MediaItem',
          context: {media},
          mediaIdx,
        };
      }))

      return rows;
    }

    return this.sections().flatMap(section => convertSection(section));
  });
}


function columnsLayout(helper: LayoutHelper): void {
  const gridSpacingX = 2;
  const gridSpacingY = 2;

  const paddingLeft = 0;
  const paddingRight = 0;

  const columns = columnCount(window.innerWidth - paddingLeft - paddingRight, 120);

  const itemWidth = (window.innerWidth - paddingLeft - paddingRight - gridSpacingX * (columns - 1)) / columns;

  let anchorIdx = helper.anchorScroll.index;

  // find the first item in the current row
  while (anchorIdx > 0) {
    const item = helper.item(helper.anchorScroll.index) as RowListItem;
    if (item.viewType === 'MediaItem') {
      if (item.mediaIdx % columns !== 0) {
        anchorIdx--;
        continue
      }
    }

    break
  }

  let idx = anchorIdx;
  let nextTop = helper.anchorScroll.offsetY;

  while (idx < helper.itemCount) {
    // layout far enough out of the screen
    if (nextTop > helper.offsetY + helper.height + helper.bufferSize) {
      break
    }

    // the element is now either a full sized row, or a thumbnail at the start of a row
    const item = helper.item(idx) as RowListItem;

    if (item.viewType === 'MediaItem') {
      console.assert(item.mediaIdx % columns === 0)

      let rowHeight = 0;
      for (let column = 0; column < columns && idx < helper.itemCount; column++) {
        // not a media item anymore, we've reached the end of this row
        const item = helper.item(idx) as RowListItem;
        if (item.viewType !== 'MediaItem') {
          break
        }

        // calculate left-position of this item
        const left = paddingLeft + column * (gridSpacingX + itemWidth);

        // get the child for this item
        const child = helper.getChild(idx++, {width: itemWidth + 'px'});
        helper.layoutChild(child, left, nextTop);

        // update row height if this child is larger then all previous
        // children were
        if (child.height > rowHeight) {
          rowHeight = child.height
        }
      }

      // if the next element to layout not also a media item, we've ended
      // the current section with this row
      const moreMediaItemsInSection = helper.item(idx)?.viewType === 'MediaItem'
      if (moreMediaItemsInSection) {
        rowHeight += gridSpacingY
      }

      nextTop += rowHeight;
    }

    if (item.viewType === 'SectionHeader') {
      // get the child for this item
      const child = helper.getChild(idx++, {width: '100vw'});
      helper.layoutChild(child, 0, nextTop);
      nextTop += child.height;
    }

  }

  idx = anchorIdx;
  let prevTop = helper.anchorScroll.offsetY;

  while (idx > 0) {
    let pending: { child: Child, left: number }[] = [];

    // we've layed out enough elements, can stop now
    if (prevTop < helper.offsetY - helper.bufferSize) {
      break
    }

    const item = helper.item(idx - 1) as RowListItem;
    if (item.viewType === 'MediaItem') {
      // need to fill the row until we reach the beginning of the row

      // but first, check if we require space to the following row
      const requireSpaceY = helper.item(idx + 1).viewType === 'MediaItem'

      const itemCountInThisRow = item.mediaIdx % columns + 1;
      for (let column = itemCountInThisRow - 1; column >= 0; column--) {
        const left = paddingLeft + column * (gridSpacingY + itemWidth)
        const child = helper.getChild(--idx, {width: itemWidth + 'px'});
        pending.push({child, left});
      }

      // height of this row
      const rowHeight = Math.max(...pending.map(p => p.child.height))
        + (requireSpaceY ? gridSpacingY : 0);

      for (const p of pending) {
        // place the children on the canvas now
        helper.layoutChild(p.child, p.left, prevTop - rowHeight);
      }

      prevTop -= rowHeight;
    }


    if (item.viewType === 'SectionHeader') {
      const child = helper.getChild(--idx, {width: '100vw'})
      helper.layoutChild(child, 0, prevTop - child.height);
      prevTop -= child.height
    }
  }
}
