import {Injectable} from '@angular/core';
import {Router} from '@angular/router';
import type {AlbumId, MediaId} from './api';

@Injectable({providedIn: 'root'})
export class NavigationService {
  constructor(private readonly router: Router) {
  }

  public async mediaViewer(id: MediaId, replaceUrl: boolean = false) {
    await this.router.navigate([
      {
        outlets: {
          media: [id],
        }
      }
    ], {
      replaceUrl
    })
  }

  public async mediaViewerInAlbum(albumId: AlbumId, mediaId: MediaId) {
    await this.openAlbum(albumId);
    await this.mediaViewer(mediaId);
  }

  public async clearMediaViewer() {
    await this.router.navigate([{
      outlets: {
        media: null
      }
    }])
  }

  public async openAlbum(id: AlbumId) {
    await this.router.navigate([
      '/albums', id,
      {
        outlets: {media: null}
      }
    ])
  }
}
