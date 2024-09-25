import type {Album, MediaItem} from './gallery';

export type Predicate = {
  album?: (album: Album) => boolean,
  media?: (album: Album, media: MediaItem) => boolean,
}

export type ResultItem =
  | { type: 'album', timestamp: Date, album: Album }
  | { type: 'media', timestamp: Date, album: Album, media: MediaItem }

export function* iterSearch(albums: Album[], predicate: Predicate): Generator<ResultItem> {
  for (const album of albums) {
    if (predicate.album != null && predicate.album(album)) {
      yield {type: 'album', timestamp: album.timestamp, album}
      continue;
    }

    if (predicate.media != null) {
      for (const media of album.items) {
        if (predicate.media(album, media)) {
          yield {type: 'media', timestamp: media.timestamp, album, media}
        }
      }
    }
  }
}

export function predicateOf(term: string): Predicate {
  const predicates = term.split(/\s+/g).map((term): Predicate => {
    term = term.toLowerCase();

    if (term.startsWith('date:')) {
      const dateTerm = term.slice(5);
      return {
        album: album => album.timestamp.toISOString().includes(dateTerm),
        media: (_album, media) => media.timestamp.toISOString().includes(dateTerm),
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
