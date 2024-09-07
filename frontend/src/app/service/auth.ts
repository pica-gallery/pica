import {inject, Injectable} from '@angular/core';
import {catchError, map, type Observable, of, tap} from 'rxjs';
import { HttpClient, HttpErrorResponse, type HttpEvent, type HttpInterceptorFn } from '@angular/common/http';
import {NavigationService} from './navigation';

export type Credentials = {
  username: string,
  password: string,
}

@Injectable({providedIn: 'root'})
export class AuthService {
  constructor(
    private readonly navigationService: NavigationService,
    private readonly httpClient: HttpClient,
  ) {
  }

  public redirectToLogin() {
    if (new URL(location.href).pathname != '/login') {
      void this.navigationService.login();
    }
  }

  public touchSession(): Observable<boolean> {
    return this.httpClient
      .post('/api/auth/touch', null, {responseType: 'blob'})
      .pipe(
        map(() => true),
        catchError(err => {
          if (err instanceof HttpErrorResponse) {
            if (err.status === 401) {
              return of(false);
            }
          }

          throw err;
        })
      )
  }

  login(creds: Credentials): Observable<boolean> {
    return this.httpClient
      .post('/api/auth/login', creds, {responseType: 'blob'})
      .pipe(
        map(() => true),
        catchError(err => {
          if (err instanceof HttpErrorResponse) {
            if (err.status === 401) {
              return of(false);
            }
          }

          throw err;
        })
      )
  }
}

export const AuthInterceptor: HttpInterceptorFn = (req, next): Observable<HttpEvent<any>> => {
  const authService = inject(AuthService);

  return next(req).pipe(
    tap({
      error: err => {
        if (err instanceof HttpErrorResponse) {
          if (err.status === 401) {
            console.info('Session is not authenticated, redirecting to login page.')
            authService.redirectToLogin();
          }
        }
      }
    })
  )
}

