import {ChangeDetectionStrategy, Component, HostBinding, Input} from '@angular/core';

@Component({
  selector: 'app-thumbnail',
  standalone: true,
  imports: [],
  template: '<img [src]="src" loading="lazy" [alt]="alt">',
  styleUrls: ['./thumbnail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ThumbnailComponent {
  @Input({required: true})
  public src!: string;

  @Input()
  public alt!: string;
}
