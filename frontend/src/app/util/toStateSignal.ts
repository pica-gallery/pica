import {BehaviorSubject, catchError, map, type Observable, of, startWith, switchMap} from 'rxjs';
import type {Signal} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';

export type ErrorState = { state: 'error', error: unknown, retry: () => void };

export type State<T> =
  | { state: 'loading' }
  | { state: 'success', data: T }
  | ErrorState

export function toStateSignal<T>(o: Observable<T>): Signal<State<T>> {
  return toSignal(toStateObservable(o), {
    initialValue: {state: 'loading'},
  })
}

export function toStateObservable<T>(o: Observable<T>): Observable<State<T>> {
  const retrySubject = new BehaviorSubject<void>(void 0);

  return retrySubject.pipe(
    switchMap(() => {
      return o.pipe(
        map<T, State<T>>(data => ({state: 'success', data})),
        catchError(error => {
          const retry = () => retrySubject.next();
          return of<ErrorState>({state: 'error', error, retry});
        }),
        startWith<State<T>>({state: 'loading'}),
      )
    })
  )
}