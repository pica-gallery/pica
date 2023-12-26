import {ChangeDetectionStrategy, Component, inject, Input, signal} from '@angular/core';
import {Gallery, type MediaItem} from '../../service/gallery';
import {map} from 'rxjs';
import {AsyncPipe} from '@angular/common';
import {ImageSwiperComponent} from '../../components/image-swiper/image-swiper.component';
import {Router} from '@angular/router';
import type {MediaId} from '../../service/api';
import {IconComponent} from '../../components/icon/icon.component';

@Component({
  selector: 'app-media-page',
  standalone: true,
  imports: [AsyncPipe, ImageSwiperComponent, IconComponent],
  templateUrl: './media-page.component.html',
  styleUrl: './media-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MediaPageComponent {
  private readonly router = inject(Router);

  protected readonly currentItem = signal<MediaItem | null>(null);

  protected readonly items$ = inject(Gallery).stream().pipe(
    map(stream => stream.items),
  )

  @Input()
  public mediaId!: MediaId;

  protected close() {
    // use history back to get rid of the current history entry.
    window.history.back();
  }

  protected itemChanged(item: MediaItem) {
    this.currentItem.set(item);

    // replace url, but let back still go to the previous page
    void this.router.navigate(['/stream/', item.id], {replaceUrl: true});
  }
}
