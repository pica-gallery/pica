import {distinctUntilChanged, map, Observable, tap} from 'rxjs';
import {NgZone} from '@angular/core';
import {enterNgZone} from './rxjs';

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
    map((screenSize: Size): number => Math.max(1, Math.ceil(screenSize.width / maxColumnSize))),
    distinctUntilChanged(),
    enterNgZone(ngZone),
  );
}
