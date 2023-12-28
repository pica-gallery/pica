import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-album-list-page',
  standalone: true,
  imports: [],
  templateUrl: './album-list-page.component.html',
  styleUrl: './album-list-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlbumListPageComponent {

}
