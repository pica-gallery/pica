import {ChangeDetectionStrategy, Component, computed, input, output} from '@angular/core';
import type {Album} from '../../service/gallery-client.service';
import {type ListItem, ListViewComponent, type SavedScroll} from '../list-view/list-view.component';
import {AlbumListItemComponent} from '../album-list-item/album-list-item.component';
import {gridLayout} from '../../layouts';

@Component({
    selector: 'app-album-list',
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

  protected readonly state = computed(() => {
    const rows: ListItem[] = this.albums().map(album => {
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

  public readonly albums = input.required<Album[]>()
  public readonly initialScrollState = input<SavedScroll | null>(null);
  public readonly scrollChanged = output<SavedScroll>();
}

let firstVisible: number;
