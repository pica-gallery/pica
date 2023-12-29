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


type SectionHeader = {
  name: string,
  timestamp: Date,
  mediaCount: number,
}

type RowState =
  | { type: 'header', header: SectionHeader }
  | { type: 'row', items: MediaItem[], columns: number }

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

    return sections.flatMap(section => this.convertSection(section, columns));
  });

  protected readonly trackByIndex = (idx: number) => idx;

  private convertSection(section: Section, columnCount: number): RowState[] {
    const rows: RowState[] = [];

    rows.push({
      type: 'header', header: {
        name: section.name,
        timestamp: section.timestamp,
        mediaCount: section.items.length,
      },
    });

    rows.push(...chunksOf(section.items, columnCount).map(chunk => {
      return {type: 'row', items: chunk, columns: columnCount} as const;
    }))

    return rows;
  }
}
