import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {Gallery} from '../../service/gallery';
import {toSignal} from '@angular/core/rxjs-interop';
import {AlbumListComponent} from '../../components/album-list/album-list.component';
import {ProgressBarComponent} from '../../components/progressbar/progress-bar.component';
import {BusyFullComponent} from '../../components/busy-full/busy-full.component';
import {fUrlScrollState, parseQuery, type UrlScrollState, UrlStateUpdater} from '../../service/persistent-state';
import {Router} from '@angular/router';
import type {SavedScroll} from '../../components/list-view/list-view.component';

@Component({
  selector: 'app-album-list-page',
  standalone: true,
  imports: [
    AlbumListComponent,
    ProgressBarComponent,
    BusyFullComponent
  ],
  templateUrl: './album-list-page.component.html',
  styleUrl: './album-list-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlbumListPageComponent {
  private readonly gallery = inject(Gallery);

  protected readonly albums = toSignal(this.gallery.albums());
  protected readonly initialScrollState: SavedScroll | null = null;

  protected readonly updater = new UrlStateUpdater<UrlScrollState>(
    fUrlScrollState,
    'scroll.',
    inject(Router),
  )

  constructor() {
    const scrollState = parseQuery(fUrlScrollState, 'scroll.');

    this.initialScrollState = scrollState && {
      index: parseInt(scrollState.id, 10),
      offsetY: scrollState.offset,
    }

    console.info('Need to restore scroll to', this.initialScrollState);
  }

  scrollChanged(scroll: SavedScroll) {
    this.updater.update({
      id: scroll.index.toString(),
      offset: scroll.offsetY,
    })
  }
}
