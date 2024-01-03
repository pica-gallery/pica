import {ChangeDetectionStrategy, Component, computed, inject, signal} from '@angular/core';
import {SearchInputComponent} from '../../components/search-input/search-input.component';
import {type Album, Gallery, type MediaItem} from '../../service/gallery';
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
  private readonly albums = toSignal(inject(Gallery).albumsWithContent());
  private readonly searchTerm = signal('');

  protected readonly results = computed(() => {
    const albums = this.albums();
    if (albums == null) {
      return null;
    }

    const term = this.searchTerm().trim();
    if (!term.length) {
      return [];
    }

    const predicate = predicateOf(term);
    return albums.filter(album => {
      if (predicate.album && predicate.album(album)) {
        return true
      }

      if (predicate.media && album.items.some(media => predicate.media!(album, media))) {
        return true;
      }

      return false;
    });
  })

  protected searchTermChanged(term: string) {
    this.searchTerm.set(term);
  }
}

type Predicate = {
  album?: (album: Album) => boolean,
  media?: (album: Album, media: MediaItem) => boolean,
}

function predicateOf(term: string): Predicate {
  const predicates = term.split(/\s+/g).map((term): Predicate => {
    term = term.toLowerCase();

    if (term.startsWith('date:')) {
      const dateTerm = term.slice(5);
      return {
        album: album => album.timestamp.toDateString().includes(dateTerm),
        media: (_album, media) => media.timestamp.toDateString().includes(dateTerm),
      }
    }

    if (term.startsWith('loc:')) {
      const locTerm = term.slice(4);
      return {
        album: (album) => {
          const location = album.location
          return location != null && location.toLowerCase().includes(locTerm);
        },

        media: (_album, media) => {
          const city = media.location?.city;
          const country = media.location?.country;
          return city != null && country != null && `${city} ${country}`.toLowerCase().includes(locTerm);
        },
      }
    }

    if (term.startsWith('city:')) {
      const cityTerm = term.slice(5);
      return {media: (_album, media) => media.location?.city.toLowerCase().includes(cityTerm) === true}
    }

    if (term.startsWith('country:')) {
      const countryTerm = term.slice(8);
      return {media: (_album, media) => media.location?.country.toLowerCase().includes(countryTerm) === true}
    }

    return {
      album: (album) => album.name.toLowerCase().includes(term),
    }
  })

  const albumPredicates = predicates.filter(p => p.album);
  const mediaPredicates = predicates.filter(p => p.media);

  return {
    album: albumPredicates.length
      ? album => albumPredicates.every(p => p.album!(album))
      : undefined,

    media: mediaPredicates.length
      ? (album, media) => mediaPredicates.every(p => p.media!(album, media))
      : undefined,
  }
}
