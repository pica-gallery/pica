import {ChangeDetectionStrategy, Component, HostListener, inject, Input} from '@angular/core';
import type {Album} from '../../service/gallery';
import {DatePipe} from '@angular/common';
import {NavigationService} from '../../service/navigation';
import {ThumbnailComponent} from '../thumbnail/thumbnail.component';

@Component({
  selector: 'app-album-list-item',
  standalone: true,
  imports: [
    DatePipe,
    ThumbnailComponent
  ],
  templateUrl: './album-list-item.component.html',
  styleUrl: './album-list-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlbumListItemComponent {
  private readonly navigationService = inject(NavigationService);

  @Input() album!: Album;


  @HostListener('click')
  protected onClick() {
    void this.navigationService.openAlbum(this.album.id);
  }
}
