import {ChangeDetectionStrategy, Component, computed, inject, signal} from '@angular/core';
import {SearchInputComponent} from '../../components/search-input/search-input.component';
import {type Album, Gallery} from '../../service/gallery';
import {toSignal} from '@angular/core/rxjs-interop';
import {AlbumListComponent} from '../../components/album-list/album-list.component';
import {BusyFullComponent} from '../../components/busy-full/busy-full.component';


@Component({
  selector: 'app-search-page',
  standalone: true,
  imports: [
    SearchInputComponent,
    AlbumListComponent,
    BusyFullComponent
  ],
  templateUrl: './search-page.component.html',
  styleUrl: './search-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchPageComponent {
  private readonly albums = toSignal(inject(Gallery).albums());
  private readonly searchTerm = signal('');

  protected readonly results = computed(() => {
    const albums = this.albums();
    if (albums == null) {
      return null;
    }

    const searchTerm = matcherOf(this.searchTerm().trim().toLowerCase());
    return albums.filter(album => searchTerm(album));
  })

  protected searchTermChanged(term: string) {
    this.searchTerm.set(term);
  }
}

type Predicate = (album: Album) => boolean;

function matcherOf(term: string): Predicate {
  if (term === '') {
    return () => true
  }

  const predicates = term.split(/\s+/g).map((term): Predicate => {
    if (term.startsWith('date:')) {
      const dateTerm = term.slice(5);
      return album => album.timestamp.toDateString().includes(dateTerm)
    }

    return album => album.name.toLowerCase().includes(term);
  })

  return album => predicates.every(pred => pred(album));
}
