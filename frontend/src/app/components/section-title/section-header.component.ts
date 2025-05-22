import {ChangeDetectionStrategy, Component, input} from '@angular/core';
import {ShortDatePipe} from '../../pipes/short-date.pipe';


export type SectionHeader = {
  name: string,
  timestamp: Date,
  mediaCount: number,
  location: string | null,
}

@Component({
    selector: 'app-section-header',
  imports: [
    ShortDatePipe
  ],
    templateUrl: './section-header.component.html',
    styleUrl: './section-header.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SectionHeaderComponent {
  public readonly header = input.required<SectionHeader>();
}
