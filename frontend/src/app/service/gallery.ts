import {Injectable} from '@angular/core';
import {
  type AlbumId,
  type AlbumTo,
  ApiService,
  type ExifInfoTo,
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
  location: string | null,
  items: MediaItem[],
}

export type Album = {
  id: AlbumId,
  name: string,
  timestamp: Date,
  relpath: string | null,
  items: MediaItem[],
  cover: MediaItem,
  location: string | null,
}

export type ExifField = {
  tag: string,
  value: string,
}

export type ExifInfo = {
  item: MediaItem,
  exif: ExifField[] | null,
}

@Injectable({providedIn: 'root'})
export class Gallery {
  private readonly albumCache = new Map<string, Observable<Album>>();
  private readonly exifCache = new Map<string, Observable<ExifInfo>>();

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
    return this.withCache(this.albumCache, albumId, () => {
      return this.apiService.album(albumId).pipe(map(convertAlbum));
    });
  }

  public exifInfo(mediaId: string): Observable<ExifInfo> {
    return this.withCache(this.exifCache, mediaId, () => {
      return this.apiService.exif(mediaId).pipe(map(convertExifInfo));
    });
  }

  private withCache<Id, T>(cache: Map<Id, Observable<T>>, id: Id, fetch: () => Observable<T>): Observable<T> {
    const cached$ = cache.get(id);
    if (cached$ != null) {
      return cached$
    }

    const fetched$ = fetch().pipe(shareReplay(1));
    cache.set(id, fetched$);
    return fetched$;
  }
}

function convertExifInfo(info: ExifInfoTo): ExifInfo {
  return {
    item: convertItem(info.item),
    exif: info.exif ?
      Object.entries(info.exif)
        .map(([tag, value]) => ({tag, value}))
        .sort((lhs, rhs) => lhs.tag.localeCompare(rhs.tag))
      : null,
  }
}

function convertAlbums(albums: AlbumTo[]): Album[] {
  return albums.map(al => convertAlbum(al));
}

function mainLocationOf(items: MediaItem[]): string | null {

  let totalCount = 0;

  const cityCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();

  for (const item of items) {
    if (item.location == null) {
      continue
    }

    // count city and country
    const loc = item.location.city + ', ' + item.location.country;
    cityCounts.set(loc, (cityCounts.get(loc) ?? 0) + 1);

    // count only country too
    countryCounts.set(loc, (countryCounts.get(item.location.country) ?? 0) + 1);

    totalCount++;
  }


  // check that >= 95 percent of the items come from one city
  for (const [loc, count] of [...cityCounts.entries()]) {
    if (count >= totalCount * 0.95) {
      return loc;
    }
  }

  // check that >= 95 percent of the items come from one country
  for (const [loc, count] of [...cityCounts.entries()]) {
    if (count >= totalCount * 0.95) {
      return loc;
    }
  }

  return null;
}

function convertAlbum(album: AlbumTo): Album {
  const items = album.items.map(item => convertItem(item));

  return {
    id: album.id,
    name: album.name,
    relpath: album.relpath,
    timestamp: album.timestamp,
    items: items,
    cover: convertItem(album.cover),
    location: mainLocationOf(items),
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
      if (section != null) {
        // finalize the previous section
        section.location = mainLocationOf(section.items);
      }

      section = {
        name: grouping.nameOf(item.timestamp),
        timestamp: item.timestamp,
        location: null,
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
