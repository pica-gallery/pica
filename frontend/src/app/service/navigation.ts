import {Injectable} from '@angular/core';
import {Router} from '@angular/router';
import type {AlbumId, MediaId} from './api';
import {array, object, string} from 'fud-ts';
import {popstate} from '../history';

const NO_MEDIA = {outlets: {media: null}}

export type NavAction =
  | { action: 'login' }
  | { action: 'top' }
  | { action: 'albums' }
  | { action: 'albums-tree', prefix: string[] }
  | { action: 'search' }
  | { action: 'album', albumId: AlbumId }
// | { action: 'media', mediaId: MediaId }
// | { action: 'mediaUpdate', mediaId: MediaId }


@Injectable({providedIn: 'root'})
export class NavigationService {
  constructor(private readonly router: Router) {
    if (currentStack().length === 0) {
      // initialize the history stack
      console.info('[history] navStack is empty, initializing stack now');
      pushHistoryItem('top');
    }
  }

  public async up(): Promise<void> {
    const navStack = currentStack();
    const target = navStack[navStack.length - 2].name ?? 'top';
    await this.backTo(target);
  }

  public async media(id: MediaId) {
    await this.router.navigate([{outlets: {media: [id],}}], {
      state: {navStack: [...currentStack(), {name: `media@${id}`}]},
    })
  }

  public async mediaUpdate(id: MediaId) {
    // replace the media item on the top of the stack
    const navStack = [...currentStack()];
    navStack[navStack.length - 1] = {name: `media@${id}`};

    await this.router.navigate([{outlets: {media: [id],}}], {
      replaceUrl: true,
      state: {navStack},
    })
  }

  public async mediaViewerInAlbum(albumId: AlbumId, mediaId: MediaId) {
    await this.album(albumId);
    await this.media(mediaId);
  }

  private async navToTop(name: string, ...segments: string[]) {
    const stack = currentStack();

    // if the item is already in the stack, we can directly jump back to it
    const targetIsInStack = stack.some(item => item.name === name);
    if (targetIsInStack) {
      await this.backTo(name);
      return;
    }

    // check if top is in the stack
    const topIsInStack = stack.some(item => item.name === 'top');
    if (topIsInStack) {
      // go back to top, but do not trigger a refresh of the page
      await this.backTo('top', false);
    }

    // do the navigation to our actual target
    console.info(`[history] navigating to "%s"`, name)
    await this.router.navigate([...segments, NO_MEDIA], {
      state: {navStack: [...currentStack(), {name}]},
    });

    console.info('[history] navStack after navigating to "%s"', name, currentStack())
  }

  public async navigate(navAction: NavAction) {
    switch (navAction.action) {
      case 'top':
        return await this.stream();
      case 'albums':
        return await this.albums();
      case 'albums-tree':
        return await this.albumsTree(navAction.prefix);
      case 'search':
        return await this.search();
      case 'album':
        return await this.album(navAction.albumId);
      case 'login':
        return await this.login();
    }
  }

  public async stream() {
    await this.navToTop('top', '/stream')
  }

  public async albums() {
    await this.navToTop('albums', '/albums')
  }

  public async albumsTree(prefix: string[]) {
    // navigate to sub album page by setting query param
    await this.router.navigate(['/albums'], {
      queryParams: {
        'albumTree.prefix': prefix.join('/'),
      },

      queryParamsHandling: 'replace',
      state: {navStack: [...currentStack(), {name: 'albums-tree'}]},
    })
  }

  public async search() {
    await this.navToTop('search', '/search')
  }

  public async login() {
    await this.navToTop('login', '/login')
  }

  public async album(id: AlbumId) {
    await this.router.navigate(['/albums', id, {outlets: {media: null},}], {
      state: {navStack: [...currentStack(), {name: 'album'}]},
    })
  }

  private async backTo(name: string, emitPopstate: boolean = true) {
    const navStack = currentStack();

    console.info('[history] want to go back to "%s", stack is:', name, JSON.stringify(navStack));
    let item = findLast(navStack, item => item.name === name);
    if (item == null) {
      return false;
    }

    const distance = navStack.indexOf(item) - (navStack.length - 1);
    console.info('[history] distance %d to target item', distance);

    if (distance) {
      popstate.blocked = !emitPopstate;
      try {
        // wait for history jump to finish by waiting for the
        // popstate event after triggering the navigation
        const navigated$ = new Promise<void>(resolve => {
          const resolver: any = () => resolve();
          resolver.POPSTATE_ALLOWED = true;
          window.addEventListener('popstate', resolver, {once: true});
        });

        // jump to the item
        history.go(distance)

        // wait for navigation to finish
        await navigated$;

      } finally {
        popstate.blocked = false;
      }
    }

    console.info('[history] stack after jumping back to "%s" is now', item.name, JSON.stringify(currentStack()));

    return item.name === name;
  }

  urlTreeOf(navAction: NavAction) {
    switch (navAction.action) {
      case 'top':
        return this.router.createUrlTree(['/stream']);
      case 'albums':
        return this.router.createUrlTree(['albums']);
      case 'albums-tree':
        return this.router.createUrlTree(['albums'], {
            queryParams: {'albumTree.prefix': navAction.prefix.join('/')},
          },
        );
      case 'search':
        return this.router.createUrlTree(['search']);
      case 'album':
        return this.router.createUrlTree(['album', navAction.albumId]);
      case 'login':
        return this.router.createUrlTree(['login'])
    }
  }
}

function currentStack(): HistoryItem[] {
  const fType = object({
    name: string(),
  })

  return array(fType).parse(window.history.state?.navStack ?? []);
}

type HistoryItem = {
  name: string,
}

export function pushHistoryItem(name: string) {
  // get a clean previous state
  const previousState = history.state ?? {}

  // get the previous stack
  const previousStack = previousState.navStack ?? [];

  const item = {name};
  const newState = {...previousState, navStack: [...previousStack, item]};
  history.replaceState(newState, '');

  console.info('[history] after updating navStack:', history.length, JSON.stringify(history.state.navStack));
}

function findLast<T>(values: T[], predicate: (value: T) => boolean): T | undefined {
  for (let i = values.length - 1; i >= 0; i--) {
    const value = values[i];

    if (predicate(value)) {
      return value;
    }
  }


  return
}
