import {
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
import {ListViewComponent} from '../list-view/list-view.component';


type SectionHeader = {
  name: string,
  timestamp: Date,
  mediaCount: number,
}

type RowState =
  | { id: string, type: 'header', header: SectionHeader }
  | { id: string, type: 'row', items: MediaItem[], columns: number }

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

  protected readonly rows = computed(() => {
    const columns = this.columnCount();
    const sections = this.sectionsSignal();
    if (!columns || !sections) {
      return null;
    }

    let rowIdx = 0;

    function convertSection(section: Section, columnCount: number): RowState[] {
      const rows: RowState[] = [];

      rows.push({
        id: 'row' + ++rowIdx,

        type: 'header', header: {
          name: section.name,
          timestamp: section.timestamp,
          mediaCount: section.items.length,
        },
      });

      rows.push(...chunksOf(section.items, columnCount).map(chunk => {
        return {
          id: 'row' + ++rowIdx,
          type: 'row',
          items: chunk,
          columns: columnCount,
        } as const;
      }))

      return rows;
    }

    return sections.flatMap(section => convertSection(section, columns));
  });

  protected readonly trackByIndex = (idx: number) => idx;
}
