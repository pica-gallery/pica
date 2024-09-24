import {ChangeDetectionStrategy, Component, input} from '@angular/core';
import {IconComponent, type IconName} from '../icon/icon.component';

@Component({
  selector: 'app-navbar-item',
  standalone: true,
  imports: [
    IconComponent
  ],
  templateUrl: './navbar-item.component.html',
  styleUrl: './navbar-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NavbarItemComponent {
  public readonly icon = input.required<IconName>();
  public readonly label = input.required<string>();
}
