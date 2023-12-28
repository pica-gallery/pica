import {Injectable} from '@angular/core';
import {Router} from '@angular/router';
import type {MediaId} from './api';

@Injectable({providedIn: 'root'})
export class NavigationService {
  constructor(private readonly router: Router) {
  }

  public async mediaViewer(id: MediaId, replaceUrl: boolean = false) {
    await this.router.navigate([
      {
        outlets: {
          media: [id]
        }
      }
    ], {
      replaceUrl
    })
  }

  public async clearMediaViewer() {
    await this.router.navigate([{
      outlets: {
        media: null
      }
    }])
  }
}
