import {patchState, signalStore, withComputed, withHooks, withMethods, withState} from '@ngrx/signals';
import {Daily, GalleryClient, type GroupingStrategy, groupStream, type MediaItem} from './gallery-client.service';
import {LOADING, mapSuccess, type State, toStateObservable} from '../util';
import {rxMethod} from '@ngrx/signals/rxjs-interop';
import {pipe, switchMap, take, tap} from 'rxjs';
import {computed, inject} from '@angular/core';

export type StreamStoreState = {
  items: State<MediaItem[]>,
  grouping: GroupingStrategy,
};

export const StreamStore = signalStore(
  {providedIn: 'root'},

  withState<StreamStoreState>({
    items: LOADING,
    grouping: Daily,
  }),

  withComputed(store => ({
    sections: computed(() => {
      return mapSuccess(
        store.items(),
        items => groupStream(items, store.grouping()),
      );
    }),
  })),

  withMethods(store => {
    const galleryClient = inject(GalleryClient);

    return {
      load: rxMethod<void>(
        pipe(
          take(1),
          switchMap(() => toStateObservable(galleryClient.stream())),
          tap(items => patchState(store, {items})),
        )
      ),
    }
  }),

  withHooks(store => ({
    onInit() {
      store.load();
    }
  }))
);
