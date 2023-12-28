import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-search-page',
  standalone: true,
  imports: [],
  templateUrl: './search-page.component.html',
  styleUrl: './search-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SearchPageComponent {

}
