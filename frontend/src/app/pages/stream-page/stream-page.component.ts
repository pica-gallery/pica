import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {AlbumComponent} from '../../components/album/album.component';
import {RouterOutlet} from '@angular/router';
import {Gallery, type MediaItem} from '../../service/gallery';
import {map} from 'rxjs';
import {toSignal} from '@angular/core/rxjs-interop';
import {NavigationService} from '../../service/navigation';
import {BusyFullComponent} from '../../components/busy-full/busy-full.component';
import {ScrollStateUpdater} from '../../service/scroll-state';
import {toStateSignal} from '../../util';
import {ErrorSnackbarComponent} from '../../components/error-snackbar/error-snackbar.component';

@Component({
  selector: 'app-stream-page',
  standalone: true,
  imports: [
    AlbumComponent,
    RouterOutlet,
    BusyFullComponent,
    ErrorSnackbarComponent
  ],
  templateUrl: './stream-page.component.html',
  styleUrl: './stream-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StreamPageComponent {
  private readonly gallery = inject(Gallery);
  private readonly router = inject(NavigationService);

  protected readonly scrollState = new ScrollStateUpdater();

  protected sections = toStateSignal(
    this.gallery.stream().pipe(map(st => st.sections)),
  );

  protected async mediaClicked(item: MediaItem) {
    await this.router.media(item.id)
  }
}

