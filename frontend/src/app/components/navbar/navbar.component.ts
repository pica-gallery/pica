import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {NavbarItemComponent} from '../navbar-item/navbar-item.component';
import {NavigationService} from '../../service/navigation';
import {NavLinkActivateDirective} from '../../directives/nav-link-activate.directive';
import {NavLinkDirective} from '../../directives/nav-link.directive';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [
    NavbarItemComponent,
    NavLinkActivateDirective,
    NavLinkDirective
  ],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NavbarComponent {
  private readonly navigationService = inject(NavigationService);

  navigateToAlbums() {
    void this.navigationService.albums();
  }

  navigateToStream() {
    void this.navigationService.stream();
  }

  navigateToSearch() {
    void this.navigationService.search();
  }
}
