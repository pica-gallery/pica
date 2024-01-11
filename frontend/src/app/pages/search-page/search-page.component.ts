import {ChangeDetectionStrategy, Component, computed, inject, signal} from '@angular/core';
import {SearchInputComponent} from '../../components/search-input/search-input.component';
import {Gallery} from '../../service/gallery';
import {toSignal} from '@angular/core/rxjs-interop';
import {AlbumListComponent} from '../../components/album-list/album-list.component';
import {BusyFullComponent} from '../../components/busy-full/busy-full.component';
import {iterSearch, predicateOf} from '../../service/search';
import {type ResultListItem, SearchResultsComponent} from '../../components/search-results/search-results.component';
import {AlbumListItemComponent} from '../../components/album-list-item/album-list-item.component';
import {ThumbnailComponent} from '../../components/thumbnail/thumbnail.component';


@Component({
  selector: 'app-search-page',
  standalone: true,
  imports: [
    SearchInputComponent,
    AlbumListComponent,
    BusyFullComponent,
    SearchResultsComponent
  ],
  templateUrl: './search-page.component.html',
  styleUrl: './search-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchPageComponent {
  private readonly albums = toSignal(inject(Gallery).albumsWithContent());
  private readonly searchTerm = signal('');

  protected readonly items = computed(() => {
    const albums = this.albums();
    if (albums == null) {
      return null;
    }

    const term = this.searchTerm().trim();
    if (!term.length) {
      return [];
    }

    const results: ResultListItem[] = [];

    for (const item of iterSearch(albums, predicateOf(term))) {
      if (item.type === 'album') {
        results.push({
          component: AlbumListItemComponent,
          inputs: {album: item.album},
          id: item.album,
        })
      }

      if (item.type === 'media') {
        results.push({
          component: ThumbnailComponent,
          inputs: {src: item.media.urls.thumb},
          id: item.media,
        })
      }
    }

    return results;
  })

  protected searchTermChanged(term: string) {
    this.searchTerm.set(term);
  }
}
