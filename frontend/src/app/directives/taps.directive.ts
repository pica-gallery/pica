import {Directive, ElementRef, inject} from '@angular/core';
import {EMPTY, fromEvent, map, merge, mergeWith, type Observable, switchMap, take, timer} from 'rxjs';
import {outputFromObservable} from '@angular/core/rxjs-interop';

export type TapType = 'tap' | 'long-tap';

@Directive({
  selector: '[appTaps]',
  standalone: true
})
export class TapsDirective {
  public readonly taps = outputFromObservable(
    taps(inject(ElementRef)),
    {alias: 'appTaps'},
  )
}

function taps(host: ElementRef): Observable<TapType> {
  const down = fromEvent<PointerEvent>(host.nativeElement, 'pointerdown').pipe(
    map(() => true),
  );

  const up = fromEvent<PointerEvent>(host.nativeElement, 'pointerup').pipe(
    map(() => false),
  );

  const cancel = fromEvent<PointerEvent>(host.nativeElement, 'pointercancel').pipe(
    map(() => false),
  );

  const leave = fromEvent<PointerEvent>(host.nativeElement, 'pointerleave').pipe(
    map(() => false),
  );

  const handleTouch = timer(500).pipe(
    // timer reached, we've detected a long tap
    map((): TapType => 'long-tap'),

    // up events trigger a 'tap' event
    mergeWith(up.pipe(map((): TapType => 'tap'))),

    // we only take the first event
    take(1),
  );

  return merge(down, cancel, leave).pipe(
    switchMap(down => down ? handleTouch : EMPTY),
  )
}
