import type { NgZone } from '@angular/core';
import type { MonoTypeOperatorFunction, Observable, Subscriber } from 'rxjs';
import { createOperatorSubscriber } from 'rxjs/internal/operators/OperatorSubscriber';
import { operate } from 'rxjs/internal/util/lift';

/**
 * Runs all downstream notifications within the given zone.
 *
 * @param ngZone The zone to run all downstream notifications (e.g. next, error, complete)
 */
export function enterNgZone<T>(ngZone: NgZone): MonoTypeOperatorFunction<T> {
  return operate((source: Observable<T>, subscriber: Subscriber<T>) => {
    const onNext = (value: T) =>
      ngZone.run(() => {
        try {
          subscriber.next(value);
        } catch (err) {
          subscriber.error(err);
        }
      });

    const onComplete = () =>
      ngZone.run(() => {
        try {
          subscriber.complete();
        } catch (err) {
          subscriber.error(err);
        }
      });

    const onError = (error?: any) =>
      ngZone.run(() => {
        subscriber.error(error);
      });

    source.subscribe(createOperatorSubscriber(subscriber, onNext, onComplete, onError));
  });
}
