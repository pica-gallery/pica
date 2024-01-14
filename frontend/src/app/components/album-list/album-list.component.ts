import {ChangeDetectionStrategy, Component, computed, EventEmitter, Input, Output, signal} from '@angular/core';
import type {Album} from '../../service/gallery';
import {type ListItem, ListViewComponent, type SavedScroll} from '../list-view/list-view.component';
import {AlbumListItemComponent} from '../album-list-item/album-list-item.component';
import {gridLayout} from '../../layouts';

@Component({
  selector: 'app-album-list',
  standalone: true,
  imports: [
    ListViewComponent
  ],
  templateUrl: './album-list.component.html',
  styleUrl: './album-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlbumListComponent {
  protected readonly layout = gridLayout({
    maxColumnWidth: 200,
    gapX: 16,
    gapY: 16,
    paddingTop: '16px',
  })

  private readonly albumsSignal = signal<Album[]>([]);

  protected readonly state = computed(() => {
    const albums = this.albumsSignal();

    const rows: ListItem[] = albums.map(album => {
      return {
        viewType: AlbumListItemComponent,
        inputs: {album},
      };
    })

    const initialScroll = firstVisible != null
      ? firstVisible
      : null;

    return {rows, initialScroll};
  });

  @Input()
  set albums(albums: Album[]) {
    this.albumsSignal.set(albums);
  }

  @Output()
  public readonly scrollChanged = new EventEmitter<SavedScroll>();
}

let firstVisible: number;
