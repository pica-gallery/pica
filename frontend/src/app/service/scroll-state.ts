import {parseQuery, UrlStateUpdater} from './persistent-state';
import {object, string, transform, type TypeOf} from 'fud-ts';
import {inject} from '@angular/core';
import {Router} from '@angular/router';
import type {SavedScroll} from '../components/list-view/list-view.component';

export const fUrlScrollState = object({
  id: string(),
  offset: string().pipe(transform(value => parseInt(value, 10))),
});

export type UrlScrollState = TypeOf<typeof fUrlScrollState>;

export class ScrollStateUpdater {
  private readonly updater = new UrlStateUpdater<UrlScrollState>(
    fUrlScrollState,
    'scroll.',
    inject(Router),
  )

  public readonly initial: SavedScroll | null = null;

  constructor() {
    const scrollState = parseQuery(fUrlScrollState, 'scroll.');

    this.initial = scrollState && {
      index: parseInt(scrollState.id, 10),
      offsetY: scrollState.offset,
    }

    console.info('Need to restore scroll to', this.initial);
  }

  public update(scroll: SavedScroll) {
    this.updater.update({
      id: scroll.index.toString(),
      offset: scroll.offsetY|0,
    })
  }
}
