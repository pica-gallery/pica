import {Injectable} from '@angular/core';
import {
  type AlbumId,
  type AlbumTo,
  ApiService,
  type MediaItemTo,
  type MediaUrls,
  mediaUrlsOf,
  type StreamTo
} from './api';
import {map, Observable, shareReplay} from 'rxjs';

export type MediaItem = MediaItemTo & {
  urls: MediaUrls,
}

export type Stream = {
  sections: Section[],
  items: MediaItem[],
}

export type Section = {
  name: string,
  timestamp: Date,
  items: MediaItem[],
}

export type Album = {
  id: AlbumId,
  name: string,
  timestamp: Date,
  relpath: string | null,
  items: MediaItem[],
  cover: MediaItem,
}

@Injectable({providedIn: 'root'})
export class Gallery {
  private readonly cache = new Map<string, Observable<Album>>();

  private readonly stream$ = this.apiService.stream().pipe(
    map(stream => convertStream(stream, Daily)),
    shareReplay({bufferSize: 1, refCount: false}),
  )

  private readonly albums$ = this.apiService.albums().pipe(
    map(albums => convertAlbums(albums)),
    shareReplay({bufferSize: 1, refCount: false}),
  )

  constructor(private readonly apiService: ApiService) {
  }

  public stream(): Observable<Stream> {
    return this.stream$;
  }

  public albums(): Observable<Album[]> {
    return this.albums$;
  }

  public album(albumId: string): Observable<Album> {
    const cached$ = this.cache.get(albumId);
    if (cached$ != null) {
      return cached$
    }

    const album$ = this.apiService.album(albumId).pipe(
      map(stream => convertAlbum(stream)),
      shareReplay(1),
    )

    this.cache.set(albumId, album$);

    return album$;
  }
}

function convertAlbums(albums: AlbumTo[]): Album[] {
  return albums.map(al => convertAlbum(al));
}

function convertAlbum(album: AlbumTo): Album {
  return {
    id: album.id,
    name: album.name,
    relpath: album.relpath,
    timestamp: album.timestamp,
    items: album.items.map(item => convertItem(item)),
    cover: convertItem(album.cover),
  }
}

function convertStream(stream: StreamTo, grouping: GroupingStrategy): Stream {
  const items = stream.items.map(item => convertItem(item));

  items.sort((lhs, rhs) => {
    return rhs.timestamp.getTime() - lhs.timestamp.getTime();
  });

  const sections: Section[] = [];

  let section: Section | null = null;
  for (const item of items) {
    if (section == null || !(grouping.partOf(section, item))) {
      section = {
        name: grouping.nameOf(item.timestamp),
        timestamp: item.timestamp,
        items: []
      }

      sections.push(section);
    }

    section.items.push(item);
  }

  return {items, sections};
}

export type GroupingStrategy = {
  partOf(album: Section, image: MediaItem): boolean
  nameOf(timestamp: Date): string,
}

export const Daily: GroupingStrategy = {
  partOf(album: Section, image: MediaItem) {
    return image.timestamp.getFullYear() === album.timestamp.getFullYear()
      && image.timestamp.getMonth() === album.timestamp.getMonth()
      && image.timestamp.getDate() === album.timestamp.getDate()
  },

  nameOf(timestamp: Date) {
    let result = '';

    result = MONTHS[timestamp.getMonth()];
    if (timestamp.getFullYear() !== YEAR) {
      result = result + ', ' + timestamp.getFullYear();
    }

    result = timestamp.getDate() + '. ' + result

    return result
  }
}

export const Monthly: GroupingStrategy = {
  partOf(album: Section, image: MediaItem) {
    return image.timestamp.getFullYear() === album.timestamp.getFullYear()
      && image.timestamp.getMonth() === album.timestamp.getMonth()
  },

  nameOf(timestamp: Date) {
    const month = MONTHS[timestamp.getMonth()];
    if (timestamp.getFullYear() !== YEAR) {
      return month + ', ' + timestamp.getFullYear();
    }

    return month
  }
}

function convertItem(item: MediaItemTo): MediaItem {
  return {...item, urls: mediaUrlsOf(item)}
}


const YEAR = new Date().getFullYear();

const MONTHS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'Novemeber',
  'Dezember',
]
