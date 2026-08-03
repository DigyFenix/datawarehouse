/** Guards de ruta del portal de usuario (por tenant). */
import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';
import { TenantService } from './tenant.service';

function hashDeRuta(ruta: ActivatedRouteSnapshot): string | null {
  let actual: ActivatedRouteSnapshot | null = ruta;
  while (actual) {
    const hash = actual.paramMap.get('hash');
    if (hash) return hash;
    actual = actual.parent;
  }
  return null;
}

/** Exige sesión del tenant; fuerza el cambio de contraseña temporal. */
export const authGuard: CanActivateFn = (ruta, estado) => {
  const auth = inject(AuthService);
  const tenant = inject(TenantService);
  const router = inject(Router);

  const hash = hashDeRuta(ruta);
  if (!hash) return router.createUrlTree(['/']);
  // Fija el tenant ANTES de leer la sesión (las claves de almacenamiento son por hash).
  if (tenant.hash() !== hash) {
    tenant.activar(hash).subscribe({ error: () => {} });
    auth.restaurar();
  }
  if (!auth.autenticado()) {
    auth.restaurar();
    if (!auth.autenticado()) return router.createUrlTree(['/', hash, 'login']);
  }
  if (auth.usuario()?.debeCambiarPassword && !estado.url.endsWith('/cambiar-password')) {
    return router.createUrlTree(['/', hash, 'cambiar-password']);
  }
  return true;
};

/** Exige además ser admin de la organización. */
export const adminGuard: CanActivateFn = (ruta, estado) => {
  const resultado = authGuard(ruta, estado);
  if (resultado !== true) return resultado;
  const auth = inject(AuthService);
  const router = inject(Router);
  const hash = hashDeRuta(ruta);
  if (!auth.usuario()?.esAdmin) return router.createUrlTree(['/', hash, 'inicio']);
  return true;
};
