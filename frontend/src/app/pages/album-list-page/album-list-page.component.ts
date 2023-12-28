import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {Gallery} from '../../service/gallery';
import {toSignal} from '@angular/core/rxjs-interop';
import {AlbumListComponent} from '../../components/album-list/album-list.component';
import {map} from 'rxjs';

@Component({
  selector: 'app-album-list-page',
  standalone: true,
  imports: [
    AlbumListComponent
  ],
  templateUrl: './album-list-page.component.html',
  styleUrl: './album-list-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlbumListPageComponent {
  private readonly gallery = inject(Gallery);
  protected readonly albums = toSignal(this.gallery.albums().pipe(map(albums => albums.slice(0, 1500))));

}
