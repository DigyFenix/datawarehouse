import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../core/auth.service';
import { TenantService } from '../core/tenant.service';
import { ToastHostComponent } from '../core/toast-host.component';
import { PreferenciaTema, ThemeService } from '../core/theme.service';
import { ConfirmComponent } from '../ui/confirm.component';
import { IconComponent } from '../ui/icon.component';

interface ItemNav {
  ruta: string;
  etiqueta: string;
  icono: string; // nombre en el mapa de <app-icon>
  soloAdmin?: boolean;
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastHostComponent, ConfirmComponent, IconComponent],
  template: `
    @if (menuAbierto()) {
      <div class="overlay overlay--sidebar" (click)="menuAbierto.set(false)"></div>
    }
    <div class="shell">
      <aside class="sidebar" [class.abierta]="menuAbierto()">
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
          <button class="sidebar__cerrar" (click)="menuAbierto.set(false)" aria-label="Cerrar menú">
            <app-icon name="cerrar" [size]="18"></app-icon>
          </button>
        </div>

        <nav class="nav">
          <span class="eyebrow nav__grupo">Módulos</span>
          @for (i of visibles(); track i.ruta) {
            <a
              class="nav__item"
              [routerLink]="['/', tenant.hash(), i.ruta]"
              routerLinkActive="activo"
              (click)="menuAbierto.set(false)"
            >
              <app-icon [name]="i.icono" [size]="18"></app-icon>
              <span>{{ i.etiqueta }}</span>
            </a>
          }
        </nav>

        <!-- El portal es white-label: manda la marca del cliente. La del producto va
             al pie, discreta, para que el usuario sepa sobre qué está trabajando. -->
        <div class="sidebar__pie">Quilate Analytics</div>
      </aside>

      <div class="area">
        <header class="topbar">
          <div class="contexto">
            <button class="topbar__hamburguesa" (click)="menuAbierto.set(true)" aria-label="Abrir menú">
              <app-icon name="menu" [size]="20"></app-icon>
            </button>
            <span class="eyebrow">{{ tenant.nombre() }}</span>
          </div>
          <div class="usuario">
            <div class="tema-toggle" role="group" aria-label="Tema del portal">
              <button
                type="button"
                [class.activo]="tema.tema() === 'claro'"
                [attr.aria-pressed]="tema.tema() === 'claro'"
                aria-label="Tema claro"
                title="Claro"
                (click)="cambiarTema('claro')"
              ><app-icon name="sol" [size]="15"></app-icon></button>
              <button
                type="button"
                [class.activo]="tema.tema() === 'sistema'"
                [attr.aria-pressed]="tema.tema() === 'sistema'"
                aria-label="Tema según el sistema"
                title="Según el sistema"
                (click)="cambiarTema('sistema')"
              ><app-icon name="sistema" [size]="15"></app-icon></button>
              <button
                type="button"
                [class.activo]="tema.tema() === 'oscuro'"
                [attr.aria-pressed]="tema.tema() === 'oscuro'"
                aria-label="Tema oscuro"
                title="Oscuro"
                (click)="cambiarTema('oscuro')"
              ><app-icon name="luna" [size]="15"></app-icon></button>
            </div>
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
    <app-confirm></app-confirm>
  `,
  styles: [`
    .shell { display: flex; min-height: 100vh; }
    .sidebar {
      width: 240px; flex-shrink: 0;
      background: var(--brand-900); color: #dfe8e0;
      display: flex; flex-direction: column;
      padding: var(--sp-5) 0;
    }
    .marca { display: flex; align-items: center; gap: 11px; padding: 4px var(--sp-5) var(--sp-5); position: relative; }
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
    .sidebar__cerrar {
      display: none; margin-left: auto; background: transparent; color: #c4d3c8; border: 0; padding: 4px;
      align-self: flex-start;
    }
    .sidebar__cerrar:hover { color: #fff; }

    .nav { display: flex; flex-direction: column; gap: 2px; padding: 0 12px; flex: 1; }
    .nav__grupo { color: #7f9686; padding: 6px 8px; }
    .sidebar__pie {
      margin-top: auto; padding: 14px 16px;
      font-size: 11.5px; letter-spacing: .04em; text-transform: uppercase;
      color: color-mix(in srgb, #7f9686 70%, transparent);
    }
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
      padding: 13px var(--sp-6); gap: var(--sp-3);
    }
    .contexto { display: flex; align-items: center; gap: var(--sp-3); min-width: 0; }
    .topbar__hamburguesa {
      display: none; background: transparent; color: var(--muted); border: 1px solid var(--border-2);
      padding: 7px;
    }
    .topbar__hamburguesa:hover { background: var(--surface-2); color: var(--text); }

    .tema-toggle {
      display: flex; border: 1px solid var(--border-2); border-radius: var(--r-sm); overflow: hidden;
    }
    .tema-toggle button {
      background: var(--surface); color: var(--muted); border: 0; border-radius: 0;
      padding: 6px 9px;
    }
    .tema-toggle button + button { border-left: 1px solid var(--border-2); }
    .tema-toggle button:hover { background: var(--surface-2); color: var(--text); }
    .tema-toggle button.activo { background: var(--brand-100); color: var(--brand-700); }

    .usuario { display: flex; align-items: center; gap: 12px; }
    .usuario__nombre { font-size: var(--fs-base); color: var(--muted); }
    .usuario__avatar {
      width: 30px; height: 30px; border-radius: 50%;
      background: var(--brand-600); color: #fff;
      display: grid; place-items: center; font-size: 13px; font-weight: 600;
    }
    .contenido { padding: var(--sp-6); flex: 1; max-width: 1280px; width: 100%; }

    .overlay--sidebar { z-index: 940; }

    @media (max-width: 880px) {
      .sidebar {
        position: fixed; inset: 0 auto 0 0; z-index: 950; height: 100vh;
        transform: translateX(-100%); transition: transform .22s cubic-bezier(.2,.8,.2,1);
        box-shadow: none;
      }
      .sidebar.abierta { transform: translateX(0); box-shadow: var(--sh-pop); }
      .sidebar__cerrar { display: inline-flex; }
      .nav { flex-direction: column; }
      .topbar__hamburguesa { display: inline-flex; }
      .usuario__nombre { display: none; }
      .contenido { padding: var(--sp-4); }
      .topbar { padding: 12px var(--sp-4); }
    }
    @media (max-width: 520px) {
      .tema-toggle { order: 3; }
    }
  `],
})
export class LayoutComponent {
  readonly auth = inject(AuthService);
  readonly tenant = inject(TenantService);
  readonly tema = inject(ThemeService);
  private readonly router = inject(Router);

  readonly menuAbierto = signal(false);

  private readonly items: ItemNav[] = [
    { ruta: 'inicio', etiqueta: 'Inicio', icono: 'inicio' },
    { ruta: 'tableros', etiqueta: 'Tableros', icono: 'grafico' },
    { ruta: 'chatbot', etiqueta: 'Asistente', icono: 'chatbot' },
    { ruta: 'admin', etiqueta: 'Administración', icono: 'admin', soloAdmin: true },
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

  cambiarTema(t: PreferenciaTema): void {
    this.tema.establecerTema(t, this.tenant.exigirHash());
  }

  salir(): void {
    const hash = this.tenant.exigirHash();
    this.auth.logout();
    void this.router.navigate(['/', hash, 'login']);
  }
}
