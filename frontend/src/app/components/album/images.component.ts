import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  NgZone,
  Output
} from '@angular/core';
import {CommonModule} from '@angular/common';
import {GridComponent} from '../grid/grid.component';
import type {MediaItem} from '../../service/gallery';
import {CdkFixedSizeVirtualScroll, CdkVirtualForOf, CdkVirtualScrollViewport} from '@angular/cdk/scrolling';
import {combineLatestWith, distinctUntilChanged, map, ReplaySubject} from 'rxjs';
import {enterNgZone} from '../../util';
import {AlbumRowComponent} from '../album-row/album-row.component';

export type Row = {
  items: MediaItem[]
}

type Sizing = {
  columnCount: number,
  rowSize: number,
}

@Component({
  selector: 'app-album',
  standalone: true,
  imports: [CommonModule, GridComponent, CdkVirtualScrollViewport, CdkVirtualForOf, CdkFixedSizeVirtualScroll, AlbumRowComponent],
  templateUrl: './images.component.html',
  styleUrls: ['./images.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ImagesComponent {
  private readonly screenWidthSubject = new ReplaySubject<number>(1);

  protected readonly sizing$ = this.screenWidthSubject.pipe(
    enterNgZone(inject(NgZone)),

    map((screenWidth: number): Sizing => {
      const columnCount = Math.ceil(screenWidth / 100);
      const columnSpacing = 4;
      const rowSize = Math.floor((screenWidth - (columnCount - 1) * columnSpacing) / columnCount);
      return {rowSize, columnCount}
    }),
  )

  private readonly itemsSubject = new ReplaySubject<MediaItem[]>(1);

  protected readonly rows$ = this.sizing$.pipe(
    map(sizing => sizing.columnCount),
    distinctUntilChanged(),
    combineLatestWith(this.itemsSubject),
    map(([columnCount, items]) => {
      const rows: Row[] = [];

      for (let i = 0; i < items.length; i += columnCount) {
        const row = {items: items.slice(i, i + columnCount)};
        rows.push(row);
      }

      return rows;
    })
  )

  constructor(elementRef: ElementRef) {
    const observer = new ResizeObserver(event => {
      const width = event[0].contentRect.width;
      this.screenWidthSubject.next(width);
    })

    observer.observe(elementRef.nativeElement);
  }

  @Input({required: true})
  public set items(items: MediaItem[]) {
    this.itemsSubject.next(items);
  }

  @Output()
  public mediaClicked = new EventEmitter<MediaItem>();
}
