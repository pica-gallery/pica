import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {CommonModule} from '@angular/common';
import type {MediaItem} from '../../service/gallery';
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
  private readonly visibleSubject = new BehaviorSubject(false);
  protected readonly visible$ = this.visibleSubject.pipe(distinctUntilChanged());

  @Input({required: true})
  public media!: MediaItem;

  public visible(visible: boolean) {
    this.visibleSubject.next(visible);
  }
}
