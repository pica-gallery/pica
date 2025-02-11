import {ChangeDetectionStrategy, Component, inject, input} from '@angular/core';
import {GalleryClient} from '../../service/gallery-client.service';
import {AsyncPipe} from '@angular/common';
import {BusyFullComponent} from '../busy-full/busy-full.component';
import {derivedAsync} from 'ngxtension/derived-async';

@Component({
    selector: 'app-exif-dialog',
    imports: [
        AsyncPipe,
        BusyFullComponent
    ],
    templateUrl: './exif-dialog.component.html',
    styleUrl: './exif-dialog.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExifDialogComponent {
  private readonly gallery = inject(GalleryClient);

  protected readonly info = derivedAsync(() => this.gallery.exifInfo(this.mediaId()));

  public readonly mediaId = input.required<string>();
}
