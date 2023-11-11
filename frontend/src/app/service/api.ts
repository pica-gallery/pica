import {Injectable} from '@angular/core';
import {array, object, string, transform, TypeOf} from 'fud-ts';
import {map, Observable} from 'rxjs';
import {HttpClient} from '@angular/common/http';

export type ImageId = string;
const fImageId = string()

const fDate = string().pipe(transform(d => new Date(d)));

export type Image = TypeOf<typeof fImage>;
const fImage = object({
  id: fImageId,
  name: string(),
  timestamp: fDate,
})

export type Album = {
  title: string,
  images: Image[],
  date: Date,
}

@Injectable({providedIn: 'root'})
export class ApiService {
  constructor(private readonly httpClient: HttpClient) {
  }

  public stream(): Observable<Album> {
    return this.album('stream')
  }

  private album(id: string): Observable<Album> {
    return this.httpClient.get<unknown>('/api/stream').pipe(
      map(resp => array(fImage).parse(resp)),
      map(images => ({
        images,
        date: images[0].timestamp,
        title: "Japan",
      })),
    )
  }
}
