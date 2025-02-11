import {ChangeDetectionStrategy, Component, computed, inject, input} from '@angular/core';
import {RouterOutlet} from '@angular/router';
import type {AlbumId} from '../../service/api';
import {type Album, type MediaItem, type Section} from '../../service/gallery-client.service';
import {AsyncPipe} from '@angular/common';
import {AlbumComponent} from '../../components/album/album.component';
import {NavigationService} from '../../service/navigation';
import {BusyFullComponent} from '../../components/busy-full/busy-full.component';
import {ScrollStateUpdater} from '../../service/scroll-state';
import {AlbumStore} from '../../service/album.store';
import {mapSuccess} from '../../util';
import {ErrorSnackbarComponent} from '../../components/error-snackbar/error-snackbar.component';

function convertToSections(album: Album): Section[] {
  return [{
    name: album.name,
    timestamp: album.timestamp,
    items: album.items,
    location: album.location,
  }]
}

@Component({
    selector: 'app-album-page',
    imports: [RouterOutlet, AsyncPipe, AlbumComponent, BusyFullComponent, ErrorSnackbarComponent],
    templateUrl: './album-page.component.html',
    styleUrls: ['./album-page.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlbumPageComponent {
  private readonly albumStore = inject(AlbumStore);
  private readonly navigationService = inject(NavigationService);

  public readonly albumId = input.required<AlbumId>();

  public readonly sections = computed(() => {
    const album = this.albumStore.byId(this.albumId());
    return mapSuccess(album, convertToSections);
  })

  protected readonly scrollState = new ScrollStateUpdater()

  protected mediaClicked(item: MediaItem) {
    void this.navigationService.media(item.id);
  }
}
