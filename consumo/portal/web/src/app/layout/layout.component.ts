import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../core/auth.service';
import { TenantService } from '../core/tenant.service';
import { ToastHostComponent } from '../core/toast-host.component';

interface ItemNav {
  ruta: string;
  etiqueta: string;
  icono: string; // path SVG (24x24)
  soloAdmin?: boolean;
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastHostComponent],
  template: `
    <div class="shell">
      <aside class="sidebar">
        <div class="marca">
          @if (tenant.logoUrl(); as logo) {
            <img [src]="logo" alt="" class="marca__img" />
          } @else {
            <div class="marca__logo">{{ iniciales() }}</div>
          }
          <div class="marca__txt">
            <strong>{{ tenant.nombre() }}</strong>
            <span>Portal de datos</span>
          </div>
        </div>

        <nav class="nav">
          <span class="eyebrow nav__grupo">Módulos</span>
          @for (i of visibles(); track i.ruta) {
            <a class="nav__item" [routerLink]="['/', tenant.hash(), i.ruta]" routerLinkActive="activo">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
                   stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path [attr.d]="i.icono"></path>
              </svg>
              <span>{{ i.etiqueta }}</span>
            </a>
          }
        </nav>
      </aside>

      <div class="area">
        <header class="topbar">
          <div class="contexto">
            <span class="eyebrow">{{ tenant.nombre() }}</span>
          </div>
          <div class="usuario">
            <span class="usuario__nombre">{{ auth.usuario()?.nombre }}</span>
            <span class="usuario__avatar">{{ inicial() }}</span>
            <button class="secundario pequeno" (click)="salir()">Salir</button>
          </div>
        </header>
        <main class="contenido">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
    <app-toast-host></app-toast-host>
  `,
  styles: [`
    .shell { display: flex; min-height: 100vh; }
    .sidebar {
      width: 240px; flex-shrink: 0;
      background: var(--brand-900); color: #dfe8e0;
      display: flex; flex-direction: column;
      padding: 20px 0;
    }
    .marca { display: flex; align-items: center; gap: 11px; padding: 4px 20px 22px; }
    .marca__img { max-width: 40px; max-height: 40px; border-radius: 9px; background: #fff; padding: 2px; }
    .marca__logo {
      width: 38px; height: 38px; border-radius: 9px;
      background: var(--amber-500); color: #14251a;
      display: grid; place-items: center; font-family: var(--display); font-weight: 700; font-size: 15px;
      letter-spacing: -.03em;
    }
    .marca__txt { display: flex; flex-direction: column; line-height: 1.25; }
    .marca__txt strong { color: #fff; font-family: var(--display); font-weight: 600; font-size: 15px; letter-spacing: -.02em; }
    .marca__txt span { font-size: 11px; color: #9db3a4; font-family: var(--mono); letter-spacing: .04em; }

    .nav { display: flex; flex-direction: column; gap: 2px; padding: 0 12px; flex: 1; }
    .nav__grupo { color: #7f9686; padding: 6px 8px; }
    .nav__item {
      display: flex; align-items: center; gap: 11px;
      padding: 9px 12px; border-radius: 8px;
      color: #c4d3c8; text-decoration: none; font-size: 14px; font-weight: 500;
      border-left: 3px solid transparent;
    }
    .nav__item:hover { background: rgba(255,255,255,.06); color: #fff; }
    .nav__item.activo {
      background: rgba(224,165,38,.14); color: #fff;
      border-left-color: var(--amber-500);
    }

    .area { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    .topbar {
      display: flex; align-items: center; justify-content: space-between;
      background: var(--surface); border-bottom: 1px solid var(--border);
      padding: 13px 28px;
    }
    .usuario { display: flex; align-items: center; gap: 12px; }
    .usuario__nombre { font-size: 13.5px; color: var(--muted); }
    .usuario__avatar {
      width: 30px; height: 30px; border-radius: 50%;
      background: var(--brand-600); color: #fff;
      display: grid; place-items: center; font-size: 13px; font-weight: 600;
    }
    .contenido { padding: 28px; flex: 1; max-width: 1280px; width: 100%; }

    @media (max-width: 720px) {
      .shell { flex-direction: column; }
      .sidebar { width: 100%; flex-direction: row; align-items: center; padding: 12px; overflow-x: auto; }
      .nav { flex-direction: row; }
      .nav__grupo { display: none; }
    }
  `],
})
export class LayoutComponent {
  readonly auth = inject(AuthService);
  readonly tenant = inject(TenantService);
  private readonly router = inject(Router);

  private readonly items: ItemNav[] = [
    { ruta: 'inicio', etiqueta: 'Inicio', icono: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10' },
    { ruta: 'tableros', etiqueta: 'Tableros', icono: 'M3 3v18h18M7 15l3-4 3 3 5-7' },
    { ruta: 'chatbot', etiqueta: 'Chatbot', icono: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
    { ruta: 'admin', etiqueta: 'Administración', icono: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75', soloAdmin: true },
  ];

  visibles(): ItemNav[] {
    const esAdmin = this.auth.usuario()?.esAdmin ?? false;
    return this.items.filter((i) => !i.soloAdmin || esAdmin);
  }

  iniciales(): string {
    const nombre = this.tenant.nombre();
    return nombre
      .split(/\s+/)
      .filter((p) => p.length > 2)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('') || nombre.slice(0, 2).toUpperCase();
  }

  inicial(): string {
    return (this.auth.usuario()?.nombre ?? '?').charAt(0).toUpperCase();
  }

  salir(): void {
    const hash = this.tenant.exigirHash();
    this.auth.logout();
    void this.router.navigate(['/', hash, 'login']);
  }
}
