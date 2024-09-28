import {ChangeDetectionStrategy, Component, inject, signal} from '@angular/core';
import {SearchInputComponent} from '../../components/search-input/search-input.component';
import {Gallery} from '../../service/gallery';
import {AlbumListComponent} from '../../components/album-list/album-list.component';
import {BusyFullComponent} from '../../components/busy-full/busy-full.component';
import {iterSearchAsync, predicateOf} from '../../service/search';
import {type ResultListItem, SearchResultsComponent} from '../../components/search-results/search-results.component';
import {parseQuery, UrlStateUpdater} from '../../service/persistent-state';
import {Router} from '@angular/router';
import type {SavedScroll} from '../../components/list-view/list-view.component';
import {object, string, transform, type TypeOf} from 'fud-ts';
import {type State, toStateSignal} from '../../util';
import {ErrorSnackbarComponent} from '../../components/error-snackbar/error-snackbar.component';
import {derivedAsync} from 'ngxtension/derived-async';


@Component({
  selector: 'app-search-page',
  standalone: true,
  imports: [
    SearchInputComponent,
    AlbumListComponent,
    BusyFullComponent,
    SearchResultsComponent,
    ErrorSnackbarComponent
  ],
  templateUrl: './search-page.component.html',
  styleUrl: './search-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchPageComponent {
  private initialState: UrlState | null = parseQuery(fUrlState, 'st.');

  private readonly albumsState = toStateSignal(inject(Gallery).albumsWithContent());
  protected readonly searchTerm = signal(this.initialState?.searchQuery ?? '');

  protected readonly updater = new UrlStateUpdater<UrlState>(
    fUrlState,
    'st.',
    inject(Router),
  )

  constructor() {
    if (this.initialState) {
      this.updater.update(this.initialState);
    }
  }

  protected readonly itemsState = derivedAsync(async (): Promise<State<ResultListItem[]>> => {
    const albums = this.albumsState();
    if (albums.state !== 'success') {
      return albums;
    }

    const term = this.searchTerm().trim();
    if (!term.length) {
      return {state: 'success', data: []};
    }

    const startTime = Date.now();

    const results: ResultListItem[] = [];

    for (const item of await iterSearchAsync(albums.data, predicateOf(term))) {
      if (item.type === 'album') {
        results.push({
          viewType: 'Album',
          context: {album: item.album},
          id: item.album,
        })
      }

      if (item.type === 'media') {
        results.push({
          viewType: 'Media',
          context: {
            src: item.media.urls.thumb,
            album: item.album,
            media: item.media,
          },
          id: item.media,
        })
      }
    }

    console.info('Searching for \'%s\' took %sms', term, (Date.now() - startTime).toFixed(2));

    return {state: 'success', data: results};
  })

  protected searchTermChanged(term: string) {
    if (this.searchTerm() !== term) {
      this.searchTerm.set(term);

      console.info('Reset scroll due to search term changed.');

      this.updater.update({
        id: 0,
        offset: 0,
        searchQuery: this.searchTerm(),
      })

      this.initialState = null;
    }
  }

  protected scrollChanged(scrollState: SavedScroll) {
    this.updater.update({
      id: scrollState.index,
      offset: scrollState.offsetY,
      searchQuery: this.searchTerm(),
    })
  }

  protected toScrollState(): SavedScroll | null {
    if (this.initialState == null) {
      return null
    }

    return {
      index: this.initialState?.id,
      offsetY: this.initialState?.offset,
    };
  }
}

const fUrlState = object({
  id: string().pipe(transform(value => parseInt(value, 10))),
  offset: string().pipe(transform(value => parseInt(value, 10))),
  searchQuery: string(),
});

type UrlState = TypeOf<typeof fUrlState>;
