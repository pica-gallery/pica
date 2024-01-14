import {Injectable} from '@angular/core';
import {type Event, NavigationEnd, Router} from '@angular/router';

export const popstate = {
  // limit event listener to exactly this listener, if the listener is registered.
  // if the value is null, all listeners are called,
  blocked: false,
};

export function instrumentHistoryTracking() {
  const addEventListener = window.addEventListener.bind(window);

  window.addEventListener = (type: string, fn: any, ...args: any[]): unknown => {
    if (type === 'popstate') {
      const fnOriginal = fn;

      fn = function (arg: PopStateEvent) {
        if (!popstate.blocked || fnOriginal?.POPSTATE_ALLOWED) {
          // forward to the intended receiver
          fnOriginal(arg);
        }
      }
    }

    return addEventListener(type, fn, ...args);
  }
}

@Injectable({providedIn: 'root'})
export class HistoryTrackingService {
  constructor(private readonly router: Router) {
    router.events.subscribe(event => this.handle(event));
  }

  private handle(event: Event) {
    if (event instanceof NavigationEnd) {
      //  this.router.
    }
  }
}

