import {ChangeDetectionStrategy, Component, inject, input} from '@angular/core';
import {Gallery} from '../../service/gallery';
import {AsyncPipe} from '@angular/common';
import {BusyFullComponent} from '../busy-full/busy-full.component';
import {derivedAsync} from 'ngxtension/derived-async';

@Component({
  selector: 'app-exif-dialog',
  standalone: true,
  imports: [
    AsyncPipe,
    BusyFullComponent
  ],
  templateUrl: './exif-dialog.component.html',
  styleUrl: './exif-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExifDialogComponent {
  private readonly gallery = inject(Gallery);

  protected readonly info = derivedAsync(() => this.gallery.exifInfo(this.mediaId()));

  public readonly mediaId = input.required<string>();
}
