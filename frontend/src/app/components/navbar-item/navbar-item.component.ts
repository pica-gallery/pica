import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
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
  @Input({required: true})
  public icon!: IconName;

  @Input({required: true})
  public label!: string;
}
