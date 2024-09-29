import {bootstrapApplication} from '@angular/platform-browser';
import {AppComponent} from './app/app.component';
import {provideHttpClient, withFetch, withInterceptors} from '@angular/common/http';
import {PreloadAllModules, provideRouter, type Route, withComponentInputBinding, withPreloading} from '@angular/router';

import './app/history';
import {instrumentHistoryTracking} from './app/history';
import {AuthInterceptor} from './app/service/auth';
import {ContentWrapperComponent} from './app/components/content-wrapper/content-wrapper.component';
import {provideExperimentalZonelessChangeDetection} from '@angular/core';

const routes: Route[] = [
  {
    path: 'login',
    pathMatch: 'full',
    loadComponent: () => import('./app/pages/login-page/login-page.component').then((m) => m.LoginPageComponent),
  },
  {
    path: '',
    component: ContentWrapperComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: '/stream',
      },
      {
        path: 'stream',
        pathMatch: 'full',
        loadComponent: () => import('./app/pages/stream-page/stream-page.component').then((m) => m.StreamPageComponent),
      },
      {
        path: 'albums',
        pathMatch: 'full',
        loadComponent: () =>
          import('./app/pages/album-list-page/album-list-page.component').then((m) => m.AlbumListPageComponent),
      },
      {
        path: 'albums/:albumId',
        pathMatch: 'full',
        loadComponent: () => import('./app/pages/album-page/album-page.component').then((m) => m.AlbumPageComponent),
      },
      {
        path: 'search',
        pathMatch: 'full',
        loadComponent: () => import('./app/pages/search-page/search-page.component').then((m) => m.SearchPageComponent),
      },
      {
        outlet: 'media',
        path: ':mediaId',
        pathMatch: 'full',
        loadComponent: () => import('./app/pages/media-page/media-page.component').then((m) => m.MediaPageComponent),
      },
    ],
  },
];

instrumentHistoryTracking();

void bootstrapApplication(AppComponent, {
  providers: [
    provideExperimentalZonelessChangeDetection(),
    provideHttpClient(withFetch(), withInterceptors([AuthInterceptor])),
    provideRouter(
      routes,
      withPreloading(PreloadAllModules),
      withComponentInputBinding(),
      // withDebugTracing(),
      // withInMemoryScrolling({scrollPositionRestoration: 'enabled'}),
    ),
  ],
});
