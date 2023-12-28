import {Injectable} from '@angular/core';
import {array, nullable, number, object, string, transform, type TypeOf} from 'fud-ts';
import {map, Observable} from 'rxjs';
import {HttpClient} from '@angular/common/http';

export type MediaId = string;
const fMediaId = string()

export type AlbumId = string;
const fAlbumId = string()

const fTimestamp = string().pipe(transform(d => new Date(d)));

export type MediaItemTo = TypeOf<typeof fMediaItem>;
const fMediaItem = object({
  id: fMediaId,
  name: string(),
  timestamp: fTimestamp,
  width: number(),
  height: number(),
})

export type AlbumTo = TypeOf<typeof fAlbum>;
const fAlbum = object({
  id: fAlbumId,
  name: string(),
  timestamp: fTimestamp,
  relpath: nullable(string()),
  items: array(fMediaItem),
})

export type StreamTo = TypeOf<typeof fStream>;
const fStream = object({
  items: array(fMediaItem),
})

@Injectable({providedIn: 'root'})
export class ApiService {
  constructor(private readonly httpClient: HttpClient) {
  }

  public stream(): Observable<StreamTo> {
    return this.httpClient.get<unknown>('/api/stream').pipe(
      map(resp => fStream.parse(resp)),
    )
  }

  public albums(): Observable<AlbumTo[]> {
    return this.httpClient.get<unknown>('/api/albums').pipe(
      map(resp => array(fAlbum).parse(resp)),
    )
  }
}

export type MediaUrls = {
  thumb: string,
  preview: string,
  fullsize: string,
}

export function mediaUrlsOf(item: MediaItemTo): MediaUrls {
  return {
    thumb: `/media/thumb/${item.id}/${item.name}`,
    preview: `/media/preview/sdr/${item.id}/${item.name}`,
    fullsize: `/media/fullsize/${item.id}/${item.name}`,
  }
}
