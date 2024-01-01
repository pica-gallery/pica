import {ChangeDetectionStrategy, Component, EventEmitter, Output} from '@angular/core';
import {IconComponent} from '../icon/icon.component';

@Component({
  selector: 'app-bottom-sheet',
  standalone: true,
  imports: [
    IconComponent
  ],
  templateUrl: './bottom-sheet.component.html',
  styleUrl: './bottom-sheet.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BottomSheetComponent {
  @Output()
  readonly close = new EventEmitter<void>();
}
