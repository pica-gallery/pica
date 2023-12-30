import {ChangeDetectionStrategy, Component, Input} from '@angular/core';

@Component({
  selector: 'app-album-list-header',
  standalone: true,
  imports: [],
  templateUrl: './album-list-header.component.html',
  styleUrl: './album-list-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlbumListHeaderComponent {
}
