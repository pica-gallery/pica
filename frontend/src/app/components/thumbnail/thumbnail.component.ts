import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  Input,
  type OnChanges,
  type SimpleChanges,
  ViewChild
} from '@angular/core';

@Component({
  selector: 'app-thumbnail',
  standalone: true,
  imports: [],
  template: '<img #Image [src]="src" loading="eager" decoding="async" [alt]="alt" fetchpriority="low">',
  styleUrls: ['./thumbnail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ThumbnailComponent implements OnChanges {
  @ViewChild('Image')
  protected imageView!: ElementRef<HTMLImageElement>

  @Input({required: true})
  public src!: string;

  @Input()
  public alt!: string;

  ngOnChanges(changes: SimpleChanges): void {
    if ('src' in changes && this.imageView != null) {
      this.imageView.nativeElement.src = "";
    }
  }
}
