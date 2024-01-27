import {ChangeDetectionStrategy, Component, EventEmitter, Input, type OnInit, Output} from '@angular/core';
import {FormControl, ReactiveFormsModule} from '@angular/forms';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {filterNotNull} from '../../util';
import {distinctUntilChanged} from 'rxjs';
import {IconComponent} from '../icon/icon.component';

@Component({
  selector: 'app-search-input',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    IconComponent
  ],
  templateUrl: './search-input.component.html',
  styleUrl: './search-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SearchInputComponent implements OnInit {
  protected readonly searchTerm = new FormControl('');

  @Input()
  public initialValue: string = '';

  @Output()
  public searchTermChanged = new EventEmitter<string>();

  constructor() {
    this.searchTerm.valueChanges
      .pipe(
        filterNotNull(),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe(this.searchTermChanged);
  }

  ngOnInit() {
    this.searchTerm.setValue(this.initialValue);
  }
}
