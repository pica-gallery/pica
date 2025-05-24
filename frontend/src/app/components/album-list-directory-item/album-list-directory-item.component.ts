import {ChangeDetectionStrategy, Component, computed, HostListener, inject, input} from '@angular/core';
import {NavigationService} from '../../service/navigation';
import {type AlbumTree, pathOf} from '../../service/album-tree';
import {ThumbnailComponent} from '../thumbnail/thumbnail.component';

@Component({
  selector: 'app-album-list-item',
  imports: [
    ThumbnailComponent
  ],
  templateUrl: './album-list-directory-item.component.html',
  styleUrl: './album-list-directory-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlbumListDirectoryItemComponent {
  private readonly navigationService = inject(NavigationService);

  public readonly albumTree = input.required<AlbumTree>();

  protected readonly thumbnails = computed(() => {
    return this.albumTree()
      .allAlbums
      .slice(0, 4)
      .map(album => album.cover.urls.thumb);
  })

  @HostListener('click')
  protected onClick() {
    const node = this.albumTree();

    void this.navigationService.navigate({
      action: 'albums-tree',
      prefix: pathOf(node),
    });
  }
}
