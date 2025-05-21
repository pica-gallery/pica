import {ChangeDetectionStrategy, Component, computed, input, output} from '@angular/core';
import type {Album} from '../../service/gallery-client.service';
import {type ListItem, ListViewComponent, type SavedScroll} from '../list-view/list-view.component';
import {AlbumListItemComponent} from '../album-list-item/album-list-item.component';
import {gridLayout} from '../../layouts';
import {AlbumListDirectoryItemComponent} from '../album-list-directory-item/album-list-directory-item.component';
import type {AlbumTree} from '../../service/album-tree';

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
    let rows: ListItem[] = [];

    // get a shallow copy of all albums,
    // we might want to include the ones from the current node.
    const albums = [...this.albums()];

    const node = this.albumTree();
    if (node != null) {
      rows.push(
        ...[...node.children.values()]
          .sort((lhs, rhs) => rhs.name.localeCompare(lhs.name))
          .map(child => ({
            viewType: AlbumListDirectoryItemComponent,
            inputs: {albumTree: child},
          }))
      );

      // include albums from current node
      albums.push(...node.albums);
    }

    // convert all albums to list items
    rows.push(...albums.map(album => {
      return {
        viewType: AlbumListItemComponent,
        inputs: {album},
      };
    }));

    const initialScroll = firstVisible != null
      ? firstVisible
      : null;

    return {rows, initialScroll};
  });

  public readonly albums = input.required<Album[]>()
  public readonly albumTree = input<AlbumTree | null>(null);


  public readonly initialScrollState = input<SavedScroll | null>(null);
  public readonly scrollChanged = output<SavedScroll>();
}

let firstVisible: number;
