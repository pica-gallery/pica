import {bootstrapApplication} from '@angular/platform-browser';
import {AppComponent} from './app/app.component';
import {provideHttpClient} from '@angular/common/http';
import {provideRouter, type Route, withComponentInputBinding, withInMemoryScrolling} from '@angular/router';

const routes: Route[] = [
  {
    path: '',
    pathMatch: 'prefix',
    loadComponent: () => import('./app/pages/album-page/album-page.component').then(m => m.AlbumPageComponent),
    children: [
      {
        path: 'stream/:mediaId',
        pathMatch: 'full',
        loadComponent: () => import('./app/pages/media-page/media-page.component').then(m => m.MediaPageComponent),
      }
    ]
  },

  // {
  //   path: 'album/:albumId/image/:imageId',
  //   pathMatch: 'full',
  //   loadComponent: () => import('./app/pages/image-page/image-page.component').then(m => m.ImagePageComponent),
  // }
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
