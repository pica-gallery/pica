import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {DatePipe} from '@angular/common';


export type SectionHeader = {
  name: string,
  timestamp: Date,
  mediaCount: number,
  location: string | null,
}

@Component({
  selector: 'app-section-header',
  standalone: true,
  imports: [
    DatePipe
  ],
  templateUrl: './section-header.component.html',
  styleUrl: './section-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SectionHeaderComponent {
  @Input({required: true})
  public header!: SectionHeader;
}
