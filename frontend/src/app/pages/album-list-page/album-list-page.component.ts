import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {AlbumListComponent} from '../../components/album-list/album-list.component';
import {BusyFullComponent} from '../../components/busy-full/busy-full.component';
import {ScrollStateUpdater} from '../../service/scroll-state';
import {ErrorSnackbarComponent} from '../../components/error-snackbar/error-snackbar.component';
import {AlbumStore} from '../../service/album.store';

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
  private readonly albumsStore = inject(AlbumStore);

  protected readonly albumsState = this.albumsStore.albums;
  protected readonly scrollState = new ScrollStateUpdater();

  constructor() {
    this.albumsStore.loadAlbums();
  }
}
