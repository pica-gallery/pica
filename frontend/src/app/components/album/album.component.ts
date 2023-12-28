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
import {distinctUntilChanged, map} from 'rxjs';
import {enterNgZone, observeElementSize, type Size} from '../../util';
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

  protected readonly columnCount = toSignal(
    observeElementSize(inject(ElementRef).nativeElement).pipe(
      map((screenSize: Size): number => Math.ceil(screenSize.width / 120)),
      distinctUntilChanged(),
      enterNgZone(inject(NgZone)),
    ),
  );

  protected readonly rows = computed(() => {
    const columns = this.columnCount();
    if (columns == null) {
      return []
    }

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

    const mediaItems = [...section.items];
    while (mediaItems.length > 0) {
      const chunk = mediaItems.splice(0, columnCount)
      rows.push({type: 'row', items: chunk, columns: columnCount});
    }

    return rows
  }
}
