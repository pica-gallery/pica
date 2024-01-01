import {ChangeDetectionStrategy, Component, Input} from '@angular/core';

@Component({
  selector: 'app-thumbnail',
  standalone: true,
  imports: [],
  template: '<img [src]="src" loading="eager" decoding="async" [alt]="alt" fetchPriority="low">',
  styleUrls: ['./thumbnail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ThumbnailComponent {
  @Input({required: true})
  public src!: string;

  @Input()
  public alt!: string;
}
