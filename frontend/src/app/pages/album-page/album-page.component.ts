import {ChangeDetectionStrategy, Component, inject, Input, type OnInit} from '@angular/core';
import {RouterOutlet} from '@angular/router';
import type {AlbumId} from '../../service/api';
import {type Album, Gallery, type MediaItem, type Section} from '../../service/gallery';
import {map, type Observable} from 'rxjs';
import {AsyncPipe} from '@angular/common';
import {AlbumComponent} from '../../components/album/album.component';
import {NavigationService} from '../../service/navigation';
import {BusyFullComponent} from '../../components/busy-full/busy-full.component';

function convertToSections(album: Album): Section[] {
  return [{
    name: album.name,
    timestamp: album.timestamp,
    items: album.items,
    location: album.location,
  }]
}

@Component({
  selector: 'app-album-page',
  standalone: true,
  imports: [RouterOutlet, AsyncPipe, AlbumComponent, BusyFullComponent],
  templateUrl: './album-page.component.html',
  styleUrls: ['./album-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlbumPageComponent implements OnInit {
  private readonly gallery = inject(Gallery);
  private readonly navigationService = inject(NavigationService);
  protected sections$!: Observable<Section[]>;

  @Input({required: true})
  albumId!: AlbumId;

  ngOnInit() {
    this.sections$ = this.gallery.album(this.albumId).pipe(map(convertToSections))
  }

  mediaClicked(item: MediaItem) {
    void this.navigationService.mediaViewer(item.id);
  }
}
