import {inject} from '@angular/core';
import {ActivatedRoute, NavigationStart, type Router} from '@angular/router';
import {defaultValue, InvalidValue, number, object, optional, string, type Type, type TypeOf} from 'fud-ts';
import {auditTime, BehaviorSubject, debounceTime, filter} from 'rxjs';

type VersionedState<T> = {
  version: number,
  value: T
}

export class UrlStateUpdater<T extends Record<string, string | number>> {
  private readonly stateSubject = new BehaviorSubject<VersionedState<T> | null>(null);
  private stateVersion: number = 0;

  constructor(
    private readonly type: Type<T, any>,
    private readonly prefix: string,
    router: Router,
  ) {
    this.stateSubject
      .pipe(auditTime(250))
      .subscribe(state => this.persist(state));

    router.events
      .pipe(filter(event => event instanceof NavigationStart))
      .subscribe(() => this.persistCurrent())
  }

  public update(state: T) {
    this.stateSubject.next({
      version: ++this.stateVersion,
      value: state,
    })
  }

  private persistCurrent() {
    this.persist(this.stateSubject.value)
  }

  private persist(state: VersionedState<T> | null) {
    if (state == null || state.version !== this.stateVersion) {
      return
    }

    // prevent double store of this one
    this.stateVersion++;

    console.info('Storing state in version', state);
    updateQueryValues(state.value, this.prefix)
  }
}

export function parseQuery<T>(type: Type<T, any>, prefix: string): InvalidValue | T {
  const route = inject(ActivatedRoute);

  const queryValues: Record<string, string> = {};
  for (const [key, value] of Object.entries(route.snapshot.queryParams)) {
    if (key.startsWith(prefix)) {
      queryValues[key.substring(prefix.length)] = value;
    }
  }

  console.info("parse", queryValues);
  return type.parseSafe(queryValues);
}

export function updateQueryValues(state: Record<string, string | number>, prefix: string) {
  const url = new URL(location.href);

  for (const [key, value] of Object.entries(state)) {
    url.searchParams.set(prefix + key, value.toString());
  }

  // update url state
  history.replaceState(history.state, '', url.toString());
}

export const fUrlScrollState = object({
  id: string(),
  offset: optional(number()).pipe(defaultValue(0)),
});

export type UrlScrollState = TypeOf<typeof fUrlScrollState>;
