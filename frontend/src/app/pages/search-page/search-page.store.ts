import {patchState, signalStore, withComputed, withHooks, withMethods, withState} from '@ngrx/signals';
import {AlbumStore} from '../../service/album.store';
import {computed, inject} from '@angular/core';
import {derivedAsync} from 'ngxtension/derived-async';
import type {State} from '../../util';
import type {ResultListItem} from '../../components/search-results/search-results.component';
import {iterSearchAsync, predicateOf} from '../../service/search';
import {rxMethod} from '@ngrx/signals/rxjs-interop';
import {tap} from 'rxjs';

export type SearchPageStoreState = {
  searchTerm: string,
};

export const SearchPageStore = signalStore(
  withState<SearchPageStoreState>({
    searchTerm: '',
  }),

  withComputed(store => ({
    searchTermTrimmed: computed(() => store.searchTerm().trim()),
  })),

  withMethods(store => ({
    updateSearchTerm: rxMethod<string>(
      tap(searchTerm => patchState(store, {searchTerm})),
    )
  })),

  withHooks(() => {
    const albumStore = inject(AlbumStore);
    return {
      onInit() {
        albumStore.loadAlbumsWithContent();
      }
    }
  }),

  withComputed(store => {
    const albumStore = inject(AlbumStore);
    return {
      results: derivedAsync(async (): Promise<State<ResultListItem[]>> => {
        const albums = albumStore.albumsWithContent();
        if (albums.state !== 'success') {
          return albums;
        }

        const term = store.searchTermTrimmed().trim();
        if (!term.length) {
          return {state: 'success', data: []};
        }

        const startTime = Date.now();

        const results: ResultListItem[] = [];

        for (const item of await iterSearchAsync(albums.data, predicateOf(term))) {
          if (item.type === 'album') {
            results.push({
              viewType: 'Album',
              context: {album: item.album},
              id: item.album,
            })
          }

          if (item.type === 'media') {
            results.push({
              viewType: 'Media',
              context: {
                src: item.media.urls.thumb,
                album: item.album,
                media: item.media,
              },
              id: item.media,
            })
          }
        }

        console.info('Searching for \'%s\' took %sms', term, (Date.now() - startTime).toFixed(2));

        return {state: 'success', data: results};
      })
    }
  }),
)
