import {Injectable} from '@angular/core';
import {ApiService, type MediaItemTo, type MediaUrls, mediaUrlsOf, type StreamTo} from './api';
import {map, Observable, shareReplay, take} from 'rxjs';

export type MediaItem = MediaItemTo & {
  urls: MediaUrls,
}

export type Stream = {
  name: string,
  timestamp: Date,
  items: MediaItem[],
}

@Injectable({providedIn: 'root'})
export class Gallery {
  private readonly cache = new Map<string, Observable<Stream>>();

  constructor(private readonly apiService: ApiService) {
  }

  public album(albumId: string): Observable<Stream> {
    const cached$ = this.cache.get(albumId);
    if (cached$ != null) {
      return cached$
    }

    const stream$ = this.apiService.stream().pipe(
      map(stream => convertStream(stream)),
      shareReplay(1),
      take(1),
    )

    this.cache.set(albumId, stream$);

    return stream$;
  }
}

function convertStream(stream: StreamTo): Stream {
  return {
    name: stream.name,
    timestamp: stream.timestamp,
    items: stream.items.map(item => {
      return {...item, urls: mediaUrlsOf(item)}
    })
  }
}
