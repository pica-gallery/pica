import {ChangeDetectionStrategy, Component, computed, inject, input} from '@angular/core';
import {AlbumListComponent} from '../../components/album-list/album-list.component';
import {BusyFullComponent} from '../../components/busy-full/busy-full.component';
import {ScrollStateUpdater} from '../../service/scroll-state';
import {ErrorSnackbarComponent} from '../../components/error-snackbar/error-snackbar.component';
import {AlbumStore} from '../../service/album.store';
import {mapSuccess} from '../../util';
import {buildAlbumTree, byPath} from '../../service/album-tree';
import {Options} from '../../service/options';

@Component({
  selector: 'app-album-list-page',
  imports: [
    AlbumListComponent,
    BusyFullComponent,
    ErrorSnackbarComponent
  ],
  templateUrl: './album-list-page.component.html',
  styleUrl: './album-list-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlbumListPageComponent {
  private readonly options = inject(Options);
  private readonly albumsStore = inject(AlbumStore);

  // optional prefix as input
  public readonly prefix = input<string | null>(null, {alias: 'albumTree.prefix'});

  protected readonly scrollState = new ScrollStateUpdater();

  protected readonly albumsState = computed(() => {
    return mapSuccess(this.albumsStore.albums(), albums => {
      const root = buildAlbumTree(albums);

      const prefix = this.prefix()?.split('/');
      const node = prefix != null ? byPath(root, prefix) : root;

      const useTree = this.options.useAlbumTree || prefix != null;

      return {
        albums: useTree ? [] : albums,
        tree: useTree ? node : null,
      }
    })
  })

  constructor() {
    this.albumsStore.loadAlbums();
  }
}
