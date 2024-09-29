import {ChangeDetectionStrategy, Component, effect, inject} from '@angular/core';
import {SearchInputComponent} from '../../components/search-input/search-input.component';
import {AlbumListComponent} from '../../components/album-list/album-list.component';
import {BusyFullComponent} from '../../components/busy-full/busy-full.component';
import {SearchResultsComponent} from '../../components/search-results/search-results.component';
import {parseQuery, UrlStateUpdater} from '../../service/persistent-state';
import {Router} from '@angular/router';
import type {SavedScroll} from '../../components/list-view/list-view.component';
import {object, string, transform, type TypeOf} from 'fud-ts';
import {ErrorSnackbarComponent} from '../../components/error-snackbar/error-snackbar.component';
import {SearchPageStore} from './search-page.store';


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
  providers: [SearchPageStore],
})
export class SearchPageComponent {
  private initialState: UrlState | null = parseQuery(fUrlState, 'st.');

  protected readonly store = inject(SearchPageStore);

  protected readonly updater = new UrlStateUpdater<UrlState>(
    fUrlState,
    'st.',
    inject(Router),
  )

  constructor() {
    if (this.initialState) {
      this.updater.update(this.initialState);
    }

    let initialSearchQuery = this.initialState?.searchQuery;
    if(initialSearchQuery) {
      this.store.updateSearchTerm(initialSearchQuery);
    }

    effect(() => {
      const searchQuery = this.store.searchTermTrimmed();
      if(searchQuery === this.initialState?.searchQuery) {
        return;
      }

      console.info('Reset scroll due to search term changed.');

      this.updater.update({
        id: 0,
        offset: 0,
        searchQuery: searchQuery,
      })

      this.initialState = null;
    });
  }

  protected searchTermChanged(term: string) {
    this.store.updateSearchTerm(term);
  }

  protected scrollChanged(scrollState: SavedScroll) {
    this.updater.update({
      id: scrollState.index,
      offset: scrollState.offsetY,
      searchQuery: this.store.searchTermTrimmed(),
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
