import {distinctUntilChanged, filter, map, Observable} from 'rxjs';
import {inject, NgZone, type Signal} from '@angular/core';
import {enterNgZone} from './rxjs';
import {toSignal} from '@angular/core/rxjs-interop';

export type Size = { width: number, height: number };

export function observeElementSize(el: Element): Observable<Size> {
  return new Observable<Size>(subscriber => {
    const observer = new ResizeObserver(events => {
      const event = events[events.length - 1];
      const width = event.contentRect.width;
      const height = event.contentRect.height;
      subscriber.next({width, height});
    })

    subscriber.add(() => observer.disconnect());

    observer.observe(el);
  });
}


export function columnCount$(element: HTMLElement, ngZone: NgZone, maxColumnSize: number): Observable<number> {
  return observeElementSize(element).pipe(
    filter(sizes => sizes.width > 0),
    map((screenSize: Size): number => columnCount(screenSize.width, maxColumnSize)),
    distinctUntilChanged(),
    enterNgZone(ngZone),
  );
}

function columnCount(width: number, maxColumnSize: number): number {
  return Math.max(1, Math.ceil(width / maxColumnSize))
}

/**
 * @warn Must be called in an injection context.
 */
export function columnCountSignal(element: HTMLElement, maxColumnSize: number): Signal<number | undefined> {
  return toSignal(columnCount$(element, inject(NgZone), maxColumnSize))
}
