import {bootstrapApplication} from '@angular/platform-browser';
import {AppComponent} from './app/app.component';
import {provideHttpClient} from '@angular/common/http';
import {provideRouter, type Route, withComponentInputBinding, withInMemoryScrolling} from '@angular/router';

const routes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: '/stream',
  },
  {
    path: 'stream',
    pathMatch: 'full',
    loadComponent: () => import('./app/pages/stream-page/stream-page.component').then(m => m.StreamPageComponent),
  },
  {
    path: 'albums',
    pathMatch: 'full',
    loadComponent: () => import('./app/pages/album-list-page/album-list-page.component').then(m => m.AlbumListPageComponent),
  },
  {
    path: 'search',
    pathMatch: 'full',
    loadComponent: () => import('./app/pages/search-page/search-page.component').then(m => m.SearchPageComponent),
  },

  {
    outlet: 'media',
    path: ':mediaId',
    pathMatch: 'full',
    loadComponent: () => import('./app/pages/media-page/media-page.component').then(m => m.MediaPageComponent),
  }
];

void bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(),
    provideRouter(routes,
      withComponentInputBinding(),
      withInMemoryScrolling({scrollPositionRestoration: 'enabled'}),
    ),
  ]
})
