import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  Output,
  signal,
  type Type
} from '@angular/core';
import {DatePipe} from '@angular/common';
import {GridComponent} from '../grid/grid.component';
import type {MediaItem, Section} from '../../service/gallery';
import {
  CdkFixedSizeVirtualScroll,
  CdkVirtualForOf,
  CdkVirtualScrollableWindow,
  CdkVirtualScrollViewport
} from '@angular/cdk/scrolling';
import {chunksOf, columnCountSignal} from '../../util';
import {AlbumRowComponent} from '../album-row/album-row.component';
import {ScrollingModule} from '@angular/cdk-experimental/scrolling';
import {MyAutoSizeVirtualScroll} from '../../directives/auto-size-scrolling.directive';
import {AlbumListComponent} from '../album-list/album-list.component';
import {type ListItem, ListViewComponent} from '../list-view/list-view.component';
import {type SectionHeader, SectionHeaderComponent} from '../section-title/section-header.component';

type SectionHeaderListItem = ListItem & {
  type: 'header',
  component: Type<SectionHeaderComponent>,
  inputs: { header: SectionHeader },
}

type ThumbnailsListItem = ListItem & {
  type: 'thumbs',
  component: Type<AlbumRowComponent>,
  inputs: { items: MediaItem[], columns: number },
  outputs: { mediaClicked: (item: MediaItem) => void },
}

type RowListItem =
  | SectionHeaderListItem
  | ThumbnailsListItem

@Component({
  selector: 'app-album',
  standalone: true,
  imports: [
    AlbumRowComponent,
    CdkFixedSizeVirtualScroll,
    CdkVirtualForOf,
    CdkVirtualScrollViewport,
    DatePipe,
    GridComponent,
    ScrollingModule,
    CdkVirtualScrollableWindow,
    MyAutoSizeVirtualScroll,
    AlbumListComponent,
    ListViewComponent,
  ],
  templateUrl: './album.component.html',
  styleUrls: ['./album.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlbumComponent {
  private readonly sectionsSignal = signal<Section[] | null>(null);

  @Input()
  public set sections(sections: Section[]) {
    this.sectionsSignal.set(sections);
  }

  @Output()
  readonly mediaClicked = new EventEmitter<MediaItem>();

  private readonly columnCount = columnCountSignal(inject(ElementRef).nativeElement, 120);

  protected readonly items = computed(() => {
    const columns = this.columnCount();
    const sections = this.sectionsSignal();
    if (!columns || !sections) {
      return null;
    }

    const convertSection = (section: Section, columnCount: number): RowListItem[] => {
      const rows: RowListItem[] = [];

      rows.push({
        type: 'header',
        component: SectionHeaderComponent,
        inputs: {
          header: {
            name: section.name,
            timestamp: section.timestamp,
            mediaCount: section.items.length,
            location: section.location,
          }
        }
      });

      rows.push(...chunksOf(section.items, columnCount).map((chunk): ThumbnailsListItem => {
        return {
          type: 'thumbs',
          component: AlbumRowComponent,
          inputs: {
            items: chunk,
            columns: columnCount,
          },
          outputs: {
            mediaClicked: value => this.mediaClicked.emit(value),
          }
        };
      }))

      return rows;
    }

    return sections.flatMap(section => convertSection(section, columns));
  });
}
