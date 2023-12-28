import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {AlbumComponent} from '../../components/album/album.component';
import {RouterOutlet} from '@angular/router';
import {Gallery, type MediaItem} from '../../service/gallery';
import {map} from 'rxjs';
import {toSignal} from '@angular/core/rxjs-interop';
import {NavigationService} from '../../service/navigation';

@Component({
  selector: 'app-stream-page',
  standalone: true,
  imports: [
    AlbumComponent,
    RouterOutlet
  ],
  templateUrl: './stream-page.component.html',
  styleUrl: './stream-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StreamPageComponent {
  private readonly gallery = inject(Gallery);
  private readonly router = inject(NavigationService);

  protected items = toSignal(this.gallery.stream().pipe(map(st => st.sections)), {initialValue: []});

  protected async mediaClicked(item: MediaItem) {
    await this.router.mediaViewer(item.id)
  }
}
