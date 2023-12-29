import {ChangeDetectionStrategy, Component} from '@angular/core';
import {NgStyle} from '@angular/common';
import {ListViewComponent} from '../../components/list-view/list-view.component';

@Component({
  selector: 'app-search-page',
  standalone: true,
  imports: [
    NgStyle,
    ListViewComponent
  ],
  templateUrl: './search-page.component.html',
  styleUrl: './search-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchPageComponent {
  items = Array(100).fill(0).map((_, idx) => ({
    id: 'id' + idx,
    height: Math.random() * 100 + 50,
    content: 'content ' + idx,
  }));
}
