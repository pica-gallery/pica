import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-album-header',
  standalone: true,
  imports: [],
  templateUrl: './album-header.component.html',
  styleUrl: './album-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlbumHeaderComponent {

}
