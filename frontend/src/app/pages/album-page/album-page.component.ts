import {ChangeDetectionStrategy, Component} from '@angular/core';
import {RouterOutlet} from '@angular/router';

@Component({
  selector: 'app-album-page',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './album-page.component.html',
  styleUrls: ['./album-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlbumPageComponent {

}
