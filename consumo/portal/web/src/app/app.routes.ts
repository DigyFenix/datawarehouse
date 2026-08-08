import { Routes } from '@angular/router';

import { adminGuard, authGuard } from './core/auth.guard';

/**
 * Todas las rutas viven bajo el hash del tenant (portal/<hash>/...): la URL de
 * ingreso que se entrega a cada organización. Sin hash → página neutra.
 */
export const routes: Routes = [
  {
    path: ':hash',
    children: [
      {
        path: 'login',
        loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
      },
      {
        // Acceso de soporte: se entra con el pase de un solo uso que emite el
        // portal de administración, no con credenciales.
        path: 'entrar-como',
        loadComponent: () =>
          import('./features/entrar-como/entrar-como.component').then(
            (m) => m.EntrarComoComponent,
          ),
      },
      {
        path: 'cambiar-password',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/cambiar-password/cambiar-password.component').then(
            (m) => m.CambiarPasswordComponent,
          ),
      },
      {
        path: '',
        canActivate: [authGuard],
        loadComponent: () => import('./layout/layout.component').then((m) => m.LayoutComponent),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'inicio' },
          {
            path: 'inicio',
            loadComponent: () =>
              import('./features/inicio/inicio.component').then((m) => m.InicioComponent),
          },
          {
            path: 'tableros',
            loadComponent: () =>
              import('./features/tableros/tableros.component').then((m) => m.TablerosComponent),
          },
          {
            path: 'tableros/:clave',
            loadComponent: () =>
              import('./features/tableros/tablero-visor.component').then(
                (m) => m.TableroVisorComponent,
              ),
          },
          {
            path: 'chatbot',
            loadComponent: () =>
              import('./features/chatbot/chatbot.component').then((m) => m.ChatbotComponent),
          },
          {
            path: 'admin',
            canActivate: [adminGuard],
            children: [
              { path: '', pathMatch: 'full', redirectTo: 'usuarios' },
              {
                path: 'usuarios',
                loadComponent: () =>
                  import('./features/admin/usuarios.component').then((m) => m.UsuariosComponent),
              },
              {
                path: 'perfiles',
                loadComponent: () =>
                  import('./features/admin/perfiles.component').then((m) => m.PerfilesComponent),
              },
              {
                path: 'glosario',
                loadComponent: () =>
                  import('./features/admin/glosario.component').then((m) => m.GlosarioComponent),
              },
              {
                path: 'auditoria',
                loadComponent: () =>
                  import('./features/admin/auditoria.component').then((m) => m.AuditoriaComponent),
              },
            ],
          },
        ],
      },
    ],
  },
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./features/sin-tenant/sin-tenant.component').then((m) => m.SinTenantComponent),
  },
  { path: '**', redirectTo: '' },
];
