import {ChangeDetectionStrategy, Component} from '@angular/core';
import {ProgressBarComponent} from '../progressbar/progress-bar.component';

@Component({
    selector: 'app-busy-full',
    imports: [
        ProgressBarComponent
    ],
    templateUrl: './busy-full.component.html',
    styleUrl: './busy-full.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class BusyFullComponent {

}
