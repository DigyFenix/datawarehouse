import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { TenantService } from '../../core/tenant.service';

/** Inicio: tarjetas de módulos del portal. El chatbot es un anticipo (Fase 4 del roadmap). */
@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page-header">
      <div class="titulo-grupo">
        <span class="eyebrow">{{ tenant.nombre() }}</span>
        <h2>Hola, {{ auth.usuario()?.nombre }}</h2>
      </div>
    </div>

    <div class="modulos">
      <a class="tarjeta modulo" [routerLink]="['/', tenant.hash(), 'tableros']">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18M7 15l3-4 3 3 5-7"></path></svg>
        <h3>Tableros</h3>
        <p>Dashboards de Power BI de tu organización, según tu perfil de acceso.</p>
      </a>
      <a class="tarjeta modulo modulo--pronto" [routerLink]="['/', tenant.hash(), 'chatbot']">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        <h3>Chatbot <span class="pronto">próximamente</span></h3>
        <p>Pregunta en lenguaje natural sobre métricas certificadas, con tu alcance de datos.</p>
      </a>
    </div>
  `,
  styles: [`
    .modulos { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 380px)); gap: 16px; }
    .modulo { display: flex; flex-direction: column; gap: 8px; padding: 22px; text-decoration: none; color: var(--text); }
    .modulo:hover { border-color: var(--brand-400); box-shadow: var(--sh-2); }
    .modulo svg { color: var(--brand-600); }
    .modulo h3 { margin: 4px 0 0; }
    .modulo p { margin: 0; color: var(--muted); font-size: 13px; }
    .modulo--pronto { opacity: .75; }
    .pronto {
      font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; font-family: var(--mono);
      background: var(--amber-100); color: var(--amber-700);
      border-radius: 999px; padding: 2px 8px; vertical-align: middle; margin-left: 6px;
    }
  `],
})
export class InicioComponent {
  readonly auth = inject(AuthService);
  readonly tenant = inject(TenantService);
}
