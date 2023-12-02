import {Injectable} from '@angular/core';
import {array, object, string, transform, type TypeOf} from 'fud-ts';
import {map, Observable} from 'rxjs';
import {HttpClient} from '@angular/common/http';

export type MediaId = string;
const fMediaId = string()

const fDate = string().pipe(transform(d => new Date(d)));

export type MediaItemTo = TypeOf<typeof fMediaItem>;
const fMediaItem = object({
  id: fMediaId,
  name: string(),
  timestamp: fDate,
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

  private album(albumId: string): Observable<StreamTo> {
    return this.httpClient.get<unknown>('/api/album/' + encodeURIComponent(albumId)).pipe(
      // TODO use fAlbum type here
      map(resp => fStream.parse(resp)),
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
