import {Injectable} from '@angular/core';
import {
  type AlbumId,
  type AlbumTo,
  ApiService,
  type ExifInfoTo,
  type MediaItemTo,
  type MediaUrls,
  mediaUrlsOf
} from './api';
import {map, Observable} from 'rxjs';

export type MediaItem = MediaItemTo & {
  urls: MediaUrls,
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
  relpathSegments: string[],
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
export class GalleryClient {
  constructor(private readonly apiService: ApiService) {
  }

  public stream(): Observable<MediaItem[]> {
    return this.apiService.stream().pipe(map(st => convertItems(st.items)));
  }

  public albums(): Observable<Album[]> {
    return this.apiService.albums().pipe(map(convertAlbums));
  }

  public albumsWithContent(): Observable<Album[]> {
    return this.apiService.albumsWithContent().pipe(map(convertAlbums));
  }

  public album(albumId: string): Observable<Album> {
    return this.apiService.album(albumId).pipe(map(convertAlbum));
  }

  public exifInfo(mediaId: string): Observable<ExifInfo> {
    return this.apiService.exif(mediaId).pipe(map(convertExifInfo));
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

export function convertAlbums(albums: AlbumTo[]): Album[] {
  return albums
    .map(al => convertAlbum(al))
    .sort((lhs, rhs) => rhs.timestamp.getTime() - lhs.timestamp.getTime());
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

export function convertAlbum(album: AlbumTo): Album {
  const items = convertItems(album.items)
    .sort((lhs, rhs) => rhs.timestamp.getTime() - lhs.timestamp.getTime())

  // split path in segments, remove empty segments
  const relpathSegments = album
    .relpath?.split('/')
    .filter(seg => seg.length) ?? [];

  return {
    id: album.id,
    name: album.name,
    relpath: album.relpath,
    timestamp: album.timestamp,
    items: items,
    cover: convertItem(album.cover),
    location: mainLocationOf(items),
    relpathSegments,
  }
}

export function groupStream(items: MediaItem[], grouping: GroupingStrategy): Section[] {
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

  return sections;
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
    if (timestamp.getFullYear() !== CURRENT_YEAR) {
      return FORMAT_YEAR_MONTH_DAY.format(timestamp);
    }

    return FORMAT_MONTH_DAY.format(timestamp);
  }
}

export const Monthly: GroupingStrategy = {
  partOf(album: Section, image: MediaItem) {
    return image.timestamp.getFullYear() === album.timestamp.getFullYear()
      && image.timestamp.getMonth() === album.timestamp.getMonth()
  },

  nameOf(timestamp: Date) {
    if (timestamp.getFullYear() !== CURRENT_YEAR) {
      return FORMAT_YEAR_MONTH.format(timestamp);
    }

    return FORMAT_MONTH.format(timestamp);
  }
}

function convertItem(item: MediaItemTo): MediaItem {
  return {...item, urls: mediaUrlsOf(item)}
}

export function convertItems(items: MediaItemTo[]): MediaItem[] {
  return items.map(item => convertItem(item));
}

const CURRENT_YEAR = new Date().getFullYear();


const FORMAT_MONTH = new Intl
  .DateTimeFormat(navigator.language, {month: 'long'});

const FORMAT_MONTH_DAY = new Intl
  .DateTimeFormat(navigator.language, {month: 'long', day: 'numeric'});

const FORMAT_YEAR_MONTH = new Intl
  .DateTimeFormat(navigator.language, {month: 'long', year: 'numeric'});

const FORMAT_YEAR_MONTH_DAY = new Intl
  .DateTimeFormat(navigator.language, {month: 'long', year: 'numeric', day: 'numeric'});
