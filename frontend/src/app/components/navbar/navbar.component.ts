import { ChangeDetectionStrategy, Component } from '@angular/core';
import {NavbarItemComponent} from '../navbar-item/navbar-item.component';
import {RouterLink, RouterLinkActive} from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [
    NavbarItemComponent,
    RouterLink,
    RouterLinkActive
  ],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NavbarComponent {

}
