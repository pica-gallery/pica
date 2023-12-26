import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {mdiAlertCircle, mdiArrowLeft, mdiDownload} from '@mdi/js'

export type IconName =
  | 'arrow-left'
  | 'download'

@Component({
  selector: 'app-icon',
  standalone: true,
  imports: [],
  templateUrl: './icon.component.html',
  styleUrl: './icon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IconComponent {
  @Input()
  public name!: IconName;

  protected get path(): string {
    switch (this.name) {
      case 'arrow-left':
        return mdiArrowLeft;

      case 'download':
        return mdiDownload;

      default:
        return mdiAlertCircle;
    }
  }
}
