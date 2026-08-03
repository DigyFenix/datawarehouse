import { Component } from '@angular/core';

/** Página neutra: se llegó sin hash de tenant (la URL de ingreso la entrega el proveedor). */
@Component({
  selector: 'app-sin-tenant',
  standalone: true,
  template: `
    <div class="panel">
      <div class="tarjeta caja">
        <h2>Portal de datos</h2>
        <p>
          Para entrar necesitas la dirección de acceso de tu organización.
          Solicítala a tu administrador.
        </p>
      </div>
    </div>
  `,
  styles: [`
    .panel { min-height: 100vh; display: grid; place-items: center; background: var(--bg); padding: 24px; }
    .caja { max-width: 420px; text-align: center; padding: 40px 32px; }
    .caja p { color: var(--muted); font-size: 13.5px; }
  `],
})
export class SinTenantComponent {}
