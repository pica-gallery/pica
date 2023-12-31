import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  inject,
  Input,
  signal
} from '@angular/core';
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
  items = signal(
    Array(100).fill(0).map((_, idx) => ({
      component: ItemComponent,
      inputs: {
        id: 'content ' + idx,
        height: Math.random() * 100 + 50,
      }
    }))
  );

  constructor() {
    // setInterval(() => this.updateItems(), 1000);
  }

  updateItems() {
    this.items.set(this.items().map(item => ({
        ...item, inputs: {...item.inputs, id: item.inputs.id + '<br>xxx'},
      }))
    )
  }
}


@Component({
  selector: 'item',
  standalone: true,
  template: `
    <div [ngStyle]="{'min-height': height + 'px'}" style="border: 1px solid blue;" [innerHTML]="id"></div>
  `,
  imports: [
    NgStyle
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ItemComponent {
  @Input()
  id!: string;

  @Input()
  height!: number;

  @HostListener('click')
  onClick() {
    this.height -= 20;
  }
}
