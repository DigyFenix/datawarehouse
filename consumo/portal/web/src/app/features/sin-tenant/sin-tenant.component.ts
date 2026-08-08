import { Component } from '@angular/core';

/**
 * Página neutra: se llegó sin hash de tenant (la URL de ingreso la entrega el
 * proveedor). Identidad de producto genérica — NUNCA el nombre de un cliente.
 */
@Component({
  selector: 'app-sin-tenant',
  standalone: true,
  template: `
    <div class="panel">
      <div class="tarjeta caja">
        <div class="marca" aria-hidden="true">
          <span class="marca__anillo"></span>
          <span class="marca__nucleo"></span>
        </div>
        <span class="eyebrow">Plataforma de BI gobernada</span>
        <h2>Quilate Analytics</h2>
        <p>
          Para entrar necesitas la dirección de acceso de tu organización.
          Solicítala a tu administrador.
        </p>
      </div>
    </div>
  `,
  styles: [`
    .panel { min-height: 100vh; display: grid; place-items: center; background: var(--bg); padding: var(--sp-6); }
    .caja { max-width: 420px; text-align: center; padding: 44px 32px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .marca { position: relative; width: 44px; height: 44px; margin-bottom: 6px; }
    .marca__anillo {
      position: absolute; inset: 0; border-radius: 50%;
      border: 2.5px solid var(--oro); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--oro) 25%, transparent);
    }
    .marca__nucleo {
      position: absolute; top: 50%; left: 50%; width: 13px; height: 13px; border-radius: 50%;
      transform: translate(-50%, -50%);
      background: radial-gradient(circle at 34% 30%, #e6c766, var(--oro));
    }
    .caja h2 { margin: 4px 0 2px; }
    .caja p { color: var(--muted); font-size: var(--fs-base); margin: 4px 0 0; max-width: 32ch; }
  `],
})
export class SinTenantComponent {}
