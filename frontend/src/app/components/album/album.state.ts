import {patchState, signalStore, withComputed, withMethods, withState} from '@ngrx/signals';
import type {MediaId} from '../../service/api';
import {computed} from '@angular/core';

export type AlbumState = {
  selected: Set<MediaId>,
}

export const AlbumState = signalStore(
  withState<AlbumState>({
    selected: new Set<MediaId>(),
  }),

  withComputed(store => ({
    hasSelected: computed(() => store.selected().size > 0),

    zipUrl: computed(() => {
      const query = [...store.selected()].map(id => `m=${id}`).join('&');
      return '/media/multi?' + query;
    })
  })),

  withMethods(store => ({
    toggle(id: MediaId) {
      patchState(store, state => {
        const selected = new Set(state.selected);
        if (selected.has(id)) {
          selected.delete(id);
        } else {
          selected.add(id);
        }

        return {selected}
      })
    },

    isSelected(id: MediaId) {
      return store.selected().has(id)
    }
  }))
)
