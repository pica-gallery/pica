import {ChangeDetectionStrategy, Component, computed, input} from '@angular/core';
import {
  mdiArrowLeft,
  mdiChevronLeft,
  mdiChevronRight,
  mdiClose,
  mdiDownload,
  mdiFolderImage,
  mdiFolderOutline,
  mdiImage,
  mdiImageOutline,
  mdiInformation,
  mdiInformationOutline,
  mdiMagnify
} from '@mdi/js'

export type IconName =
  | 'unknown'
  | 'albums'
  | 'albums-outline'
  | 'arrow-left'
  | 'chevron-left'
  | 'chevron-right'
  | 'download'
  | 'image'
  | 'image-outline'
  | 'info'
  | 'search'
  | 'search-outline'
  | 'close'

@Component({
  selector: 'app-icon',
  standalone: true,
  imports: [],
  templateUrl: './icon.component.html',
  styleUrl: './icon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IconComponent {
  public readonly name = input.required<IconName>();

  protected readonly path = computed(() => {
    switch (this.name()) {
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

      case 'close':
        return mdiClose;

      case 'info':
        return mdiInformation;

      case 'chevron-left':
        return mdiChevronLeft

      case 'chevron-right':
        return mdiChevronRight

      case 'unknown':
        return mdiInformationOutline;
    }
  });
}
