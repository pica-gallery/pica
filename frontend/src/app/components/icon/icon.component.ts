import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {
  mdiArrowLeft,
  mdiDownload,
  mdiFolderImage,
  mdiFolderOutline,
  mdiImage,
  mdiImageOutline,
  mdiImageSearch,
  mdiImageSearchOutline,
  mdiInformationOutline, mdiMagnify
} from '@mdi/js'

export type IconName =
  | 'unknown'
  | 'arrow-left'
  | 'download'
  | 'image'
  | 'image-outline'
  | 'albums'
  | 'albums-outline'
  | 'search'
  | 'search-outline'

@Component({
  selector: 'app-icon',
  standalone: true,
  imports: [],
  templateUrl: './icon.component.html',
  styleUrl: './icon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IconComponent {
  @Input({required: true})
  public name: IconName = 'unknown';

  protected get path(): string {
    switch (this.name) {
      case 'arrow-left':
        return mdiArrowLeft;

      case 'download':
        return mdiDownload;

      case 'image':
        return mdiImage;

      case 'image-outline':
        return mdiImageOutline;

      case 'albums':
        return mdiFolderImage;

      case 'albums-outline':
        return mdiFolderOutline;

      case 'search':
        return mdiMagnify;

      case 'search-outline':
        return mdiMagnify;

      case 'unknown':
        return mdiInformationOutline;
    }
  }
}
