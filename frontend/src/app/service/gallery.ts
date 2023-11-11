import {Injectable} from '@angular/core';
import {Album, ApiService} from './api';
import {Observable, shareReplay, take} from 'rxjs';

@Injectable({providedIn: 'root'})
export class Gallery {
  private readonly cache = new Map<string, Observable<Album>>();

  constructor(private readonly apiService: ApiService) {
  }

  public album(albumId: string): Observable<Album> {
    const cached$ = this.cache.get(albumId);
    if (cached$ != null) {
      return cached$
    }

    const album$ = this.apiService.stream().pipe(
      shareReplay(1),
      take(1),
    )

    this.cache.set(albumId, album$);

    return album$;
  }
}
