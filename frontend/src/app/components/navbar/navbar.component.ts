import {ChangeDetectionStrategy, Component} from '@angular/core';
import {NavbarItemComponent} from '../navbar-item/navbar-item.component';
import {NavLinkActivateDirective} from '../../directives/nav-link-activate.directive';
import {NavLinkDirective} from '../../directives/nav-link.directive';

@Component({
    selector: 'app-navbar',
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
}
