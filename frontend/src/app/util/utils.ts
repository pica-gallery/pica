import type {ActivatedRoute} from '@angular/router';

export function nextAnimationFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

export function delay(millis: number): Promise<void> {
  return new Promise(resolve => setTimeout(() => resolve(), millis));
}


export function* iterActivatedRoute(route: ActivatedRoute): Generator<ActivatedRoute> {
  for (const child of route.children) {
    yield child;

    for (const grandChild of iterActivatedRoute(child)) {
      yield grandChild
    }
  }
}

export async function idleCallback(): Promise<IdleDeadline> {
  return await new Promise(resolve => requestIdleCallback(resolve));
}
