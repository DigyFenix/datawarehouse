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
        path: 'autorizaciones',
        loadComponent: () =>
          import('./features/autorizaciones/autorizaciones.component').then(
            (m) => m.AutorizacionesComponent,
          ),
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
        path: 'conexiones',
        loadComponent: () =>
          import('./features/conexiones/conexiones.component').then((m) => m.ConexionesComponent),
      },
      {
        path: 'sociedades',
        loadComponent: () =>
          import('./features/sociedades/sociedades.component').then((m) => m.SociedadesComponent),
      },
      {
        path: 'ingesta',
        loadComponent: () =>
          import('./features/ingesta/ingesta.component').then((m) => m.IngestaComponent),
      },
      {
        path: 'campos/:objeto',
        loadComponent: () =>
          import('./features/campos/campos.component').then((m) => m.CamposComponent),
      },
      {
        path: 'canonico',
        loadComponent: () =>
          import('./features/canonico/canonico.component').then((m) => m.CanonicoComponent),
      },
      {
        path: 'canonico/:clave',
        loadComponent: () =>
          import('./features/canonico/canonico-entidad.component').then((m) => m.CanonicoEntidadComponent),
      },
      {
        path: 'portal-usuario',
        loadComponent: () =>
          import('./features/portal-usuario/portal-usuario.component').then((m) => m.PortalUsuarioComponent),
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
