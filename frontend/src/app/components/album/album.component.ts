import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  NgZone,
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
import {chunksOf, columnCount$} from '../../util';
import {AlbumRowComponent} from '../album-row/album-row.component';
import {toSignal} from '@angular/core/rxjs-interop';
import {ScrollingModule} from '@angular/cdk-experimental/scrolling';


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
  ],
  templateUrl: './album.component.html',
  styleUrls: ['./album.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlbumComponent {
  private readonly sectionsSignal = signal<Section[]>([]);

  @Input()
  public set sections(sections: Section[]) {
    this.sectionsSignal.set(sections);
  }

  private readonly columnCount = toSignal(
    columnCount$(inject(ElementRef).nativeElement, inject(NgZone), 120),
  );

  protected readonly rows = computed(() => {
    const columns = this.columnCount() ?? 4;
    return this.sectionsSignal().flatMap(section => this.convertSection(section, columns));
  });

  @Output()
  readonly mediaClicked = new EventEmitter<MediaItem>();

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
