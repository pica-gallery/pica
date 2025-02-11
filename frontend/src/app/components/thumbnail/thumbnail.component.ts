import {
  ChangeDetectionStrategy,
  Component,
  effect,
  type ElementRef,
  input,
  type OnChanges,
  type SimpleChanges,
  untracked,
  viewChild
} from '@angular/core';

@Component({
    selector: 'app-thumbnail',
    imports: [],
    template: '<img #Image loading="eager" decoding="async" [alt]="alt()" fetchpriority="low">',
    styleUrls: ['./thumbnail.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ThumbnailComponent {
  protected readonly imageView = viewChild.required<ElementRef>('Image');

  public readonly src = input.required<string>();
  public readonly alt = input<string>();

  constructor() {
    effect(() => {
      // reset the native source before setting it to the new value. this prevents
      // the old image being visible on fast scrolling
      const img = untracked(this.imageView).nativeElement;
      img.src = ''
      img.src = this.src();
    });
  }
}
