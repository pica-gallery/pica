import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {AlbumListItemComponent} from '../album-list-item/album-list-item.component';
import type {Album} from '../../service/gallery';

@Component({
  selector: 'app-album-list-row',
  standalone: true,
  imports: [
    AlbumListItemComponent,
  ],
  templateUrl: './album-list-row.component.html',
  styleUrl: './album-list-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlbumListRowComponent {
  @Input({required: true})
  public items!: Album[];
}
