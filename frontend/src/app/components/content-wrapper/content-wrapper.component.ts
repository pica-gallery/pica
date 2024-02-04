import { ChangeDetectionStrategy, Component } from '@angular/core';
import {NavbarComponent} from '../navbar/navbar.component';
import {RouterOutlet} from '@angular/router';

@Component({
  selector: 'app-content-wrapper',
  standalone: true,
  imports: [
    NavbarComponent,
    RouterOutlet
  ],
  templateUrl: './content-wrapper.component.html',
  styleUrl: './content-wrapper.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ContentWrapperComponent {

}
