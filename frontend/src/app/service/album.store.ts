import {patchState, signalStore, withMethods, withState} from '@ngrx/signals';
import {type Album, GalleryClient} from './gallery-client.service';
import {LOADING, type State, toStateObservable} from '../util';
import {rxMethod} from '@ngrx/signals/rxjs-interop';
import {filter, pipe, switchMap, take, tap} from 'rxjs';
import {inject} from '@angular/core';
import type {AlbumId} from './api';

export type AlbumStoreState = {
  albums: State<Album[]>,
  albumsWithContent: State<Album[]>,
  albumsById: Map<AlbumId, State<Album>>,
};

export const AlbumStore = signalStore(
  {providedIn: 'root'},

  withState<AlbumStoreState>({
    albums: LOADING,
    albumsWithContent: LOADING,
    albumsById: new Map(),
  }),

  withMethods(store => {
    const galleryService = inject(GalleryClient);

    return {
      loadAlbums: rxMethod<void>(
        pipe(
          take(1),
          switchMap(() => toStateObservable(galleryService.albums())),
          tap(albums => patchState(store, {albums})),
        )
      ),

      loadAlbumsWithContent: rxMethod<void>(
        pipe(
          take(1),
          switchMap(() => toStateObservable(galleryService.albumsWithContent())),
          tap(albums => patchState(store, {albumsWithContent: albums})),
        )
      ),

      loadAlbum: rxMethod<AlbumId>(
        pipe(
          filter(albumId => !store.albumsById().has(albumId)),
          switchMap(albumId => toStateObservable(galleryService.album(albumId)).pipe(
            tap(album => patchState(store, updateAlbumById(albumId, album))),
          )),
        )
      ),

      byId(albumId: AlbumId): State<Album> {
        setTimeout(() => this.loadAlbum(albumId));
        return store.albumsById().get(albumId) ?? LOADING
      }
    }
  })
);

function updateAlbumById(id: AlbumId, album: State<Album>) {
  return (state: AlbumStoreState) => {
    const albumsById = new Map(state.albumsById);
    albumsById.set(id, album);
    return {albumsById}
  }
}
