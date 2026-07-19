import { Routes } from '@angular/router';

import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/layout.component').then((m) => m.LayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'organizaciones' },
      {
        path: 'organizaciones',
        loadComponent: () =>
          import('./features/organizaciones/organizaciones.component').then((m) => m.OrganizacionesComponent),
      },
      {
        path: 'usuarios',
        loadComponent: () =>
          import('./features/usuarios/usuarios.component').then((m) => m.UsuariosComponent),
      },
      {
        path: 'glosario',
        loadComponent: () =>
          import('./features/glosario/glosario.component').then((m) => m.GlosarioComponent),
      },
      {
        path: 'metricas',
        loadComponent: () =>
          import('./features/metricas/metricas.component').then((m) => m.MetricasComponent),
      },
      {
        path: 'auditoria',
        loadComponent: () =>
          import('./features/auditoria/auditoria.component').then((m) => m.AuditoriaComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
