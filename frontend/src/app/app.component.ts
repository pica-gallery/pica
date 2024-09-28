import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {RouterOutlet} from '@angular/router';
import {HistoryTrackingService} from './history';
import {filter, fromEvent} from 'rxjs';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: true,
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  constructor() {
    inject(HistoryTrackingService)

    // disable context menu
    fromEvent<Event>(document, 'contextmenu')
      .pipe(
        filter(ev => !(ev.target instanceof HTMLInputElement)),
        takeUntilDestroyed()
      )
      .subscribe(ev => ev.preventDefault());
  }
}
