import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {CommonModule} from '@angular/common';
import {Image} from '../../service/api';
import {BehaviorSubject, distinctUntilChanged} from 'rxjs';

@Component({
  selector: 'app-image-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-view.component.html',
  styleUrls: ['./image-view.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ImageViewComponent {
  @Input({required: true})
  public image!: Image;

  private readonly loadSubject = new BehaviorSubject(false);
  protected readonly load$ = this.loadSubject.pipe(distinctUntilChanged());

  protected get thumbsUrl(): string {
    return '/thumbs/' + this.image.id;
  }

  protected get imageUrl(): string {
    return '/images/' + this.image.id;
  }

  public load() {
    this.loadSubject.next(true);
  }
}
