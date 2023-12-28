import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import type {Album} from '../../service/gallery';
import {DatePipe} from '@angular/common';

@Component({
  selector: 'app-album-list-item',
  standalone: true,
  imports: [
    DatePipe
  ],
  templateUrl: './album-list-item.component.html',
  styleUrl: './album-list-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlbumListItemComponent {
  @Input() album!: Album;

}
