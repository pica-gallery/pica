import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {AlbumComponent} from '../../components/album/album.component';
import {RouterOutlet} from '@angular/router';
import {type MediaItem} from '../../service/gallery-client.service';
import {NavigationService} from '../../service/navigation';
import {BusyFullComponent} from '../../components/busy-full/busy-full.component';
import {ScrollStateUpdater} from '../../service/scroll-state';
import {ErrorSnackbarComponent} from '../../components/error-snackbar/error-snackbar.component';
import {StreamStore} from '../../service/stream.store';

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
  private readonly router = inject(NavigationService);

  protected readonly scrollState = new ScrollStateUpdater();
  protected readonly sections = inject(StreamStore).sections;

  protected async mediaClicked(item: MediaItem) {
    await this.router.media(item.id)
  }
}

