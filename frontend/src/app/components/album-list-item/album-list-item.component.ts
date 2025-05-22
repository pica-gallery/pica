import {ChangeDetectionStrategy, Component, HostListener, inject, input} from '@angular/core';
import type {Album} from '../../service/gallery-client.service';
import {NavigationService} from '../../service/navigation';
import {ThumbnailComponent} from '../thumbnail/thumbnail.component';
import {ShortDatePipe} from '../../pipes/short-date.pipe';

@Component({
    selector: 'app-album-list-item',
  imports: [
    ThumbnailComponent,
    ShortDatePipe
  ],
    templateUrl: './album-list-item.component.html',
    styleUrl: './album-list-item.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlbumListItemComponent {
  private readonly navigationService = inject(NavigationService);

  public readonly album = input.required<Album>();

  @HostListener('click')
  protected onClick() {
    void this.navigationService.navigate({
      action: 'album',
      albumId: this.album().id,
    });
  }
}
