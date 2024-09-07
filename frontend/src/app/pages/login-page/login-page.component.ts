import {ChangeDetectionStrategy, Component, inject, signal} from '@angular/core';
import {FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators} from '@angular/forms';
import {AuthService} from '../../service/auth';
import {firstValueFrom, map} from 'rxjs';
import {NavigationService} from '../../service/navigation';
import {derivedAsync} from 'ngxtension/derived-async';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormsModule
  ],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginPageComponent {
  private readonly authService = inject(AuthService);
  private readonly navService = inject(NavigationService);

  protected readonly failure = signal(false);

  protected readonly canSubmit = derivedAsync(() => {
    return this.credentials
      .statusChanges
      .pipe(map(st => st === 'VALID'))
  }, {initialValue: false})

  protected readonly credentials = new FormGroup({
    username: new FormControl('', {nonNullable: true, validators: Validators.required}),
    password: new FormControl('', {nonNullable: true, validators: Validators.required}),
  });


  async onSubmit() {
    if (!this.credentials.valid) {
      return
    }

    this.failure.set(false);

    const creds = this.credentials.getRawValue();
    this.credentials.disable();
    try {
      const loginOk = await firstValueFrom(this.authService.login(creds));
      if (loginOk) {
        await this.navService.navigate({action: 'top'});
        return;
      }

      this.failure.set(true);

    } finally {
      this.credentials.enable();
    }
  }
}
