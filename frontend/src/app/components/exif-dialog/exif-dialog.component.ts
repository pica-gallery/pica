import {ChangeDetectionStrategy, Component, inject, Input, type OnInit} from '@angular/core';
import {type ExifInfo, Gallery} from '../../service/gallery';
import type {Observable} from 'rxjs';
import {AsyncPipe} from '@angular/common';
import {BusyFullComponent} from '../busy-full/busy-full.component';

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
export class ExifDialogComponent implements OnInit {
  private readonly gallery = inject(Gallery);

  protected info$!: Observable<ExifInfo>;

  @Input({required: true})
  mediaId!: string;

  ngOnInit(): void {
    this.info$ = this.gallery.exifInfo(this.mediaId);
  }
}
