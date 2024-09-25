import {ChangeDetectionStrategy, Component, computed, input} from '@angular/core';
import {SnackbarComponent} from '../snackbar/snackbar.component';
import type {ErrorState} from '../../util';
import {HttpErrorResponse} from '@angular/common/http';

@Component({
  selector: 'app-error-snackbar',
  standalone: true,
  imports: [
    SnackbarComponent
  ],
  templateUrl: './error-snackbar.component.html',
  styleUrl: './error-snackbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ErrorSnackbarComponent {
  public readonly errorState = input.required<ErrorState>();

  protected readonly message = computed(() => {
    const err = this.errorState().error;

    if (err instanceof HttpErrorResponse) {
      return 'Network error: ' + err.message;
    }

    if (err instanceof Error) {
      return err.message
    }

    return JSON.stringify(err)
  })
}
