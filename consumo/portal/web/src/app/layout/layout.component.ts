import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

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
  grupo: 'Explorar' | 'Autoservicio' | 'Organización';
  soloAdmin?: boolean;
  soloAsistente?: boolean; // módulo que se vende aparte
}

/**
 * Cascarón del portal: barra lateral clara con el logo del cliente y el menú por grupos,
 * franja superior fina con el contexto y el contenido centrado. El color de marca del
 * tenant aparece solo en la selección, el avatar y las acciones.
 */
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
        <div class="marca" [class.marca--ancha]="tenant.logoAncho()">
          @if (tenant.logoUrl(); as logo) {
            <img [src]="logo" [alt]="tenant.nombre()" class="marca__img" (load)="tenant.medirLogo($event)" />
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
          @for (g of grupos(); track g.nombre) {
            <div class="nav__grupo">
              <span class="nav__rotulo">{{ g.nombre }}</span>
              @for (i of g.items; track i.ruta) {
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
            </div>
          }
        </nav>

        <div class="sidebar__pie">
          <div class="cuenta">
            <span class="cuenta__avatar">{{ inicial() }}</span>
            <div class="cuenta__txt">
              <strong>{{ auth.usuario()?.nombre }}</strong>
              <span>{{ auth.usuario()?.esAdmin ? 'Administrador' : 'Usuario' }}</span>
            </div>
            <button class="cuenta__salir" (click)="salir()" title="Cerrar sesión" aria-label="Cerrar sesión">
              <app-icon name="salir" [size]="16"></app-icon>
            </button>
          </div>
          <span class="producto">Quilate Analytics</span>
        </div>
      </aside>

      <div class="area">
        @if (auth.impersonadoPor(); as operador) {
          <div class="banda-suplantacion" role="status">
            <span>
              Estás viendo el portal como <strong>{{ auth.usuario()?.nombre }}</strong>
              ({{ auth.usuario()?.email }}). Sesión de solo lectura abierta por {{ operador }}.
            </span>
            <button class="banda-suplantacion__salir" (click)="salir()">Terminar</button>
          </div>
        }

        <header class="topbar">
          <div class="contexto">
            <button class="topbar__hamburguesa" (click)="menuAbierto.set(true)" aria-label="Abrir menú">
              <app-icon name="menu" [size]="20"></app-icon>
            </button>
            <span class="contexto__org">{{ tenant.nombre() }}</span>
            @if (seccionActual(); as s) {
              <span class="contexto__sep" aria-hidden="true">/</span>
              <span class="contexto__seccion">{{ s }}</span>
            }
          </div>
          <div class="herramientas">
            <div class="tema-toggle" role="group" aria-label="Tema del portal">
              <button type="button" [class.activo]="tema.tema() === 'claro'" [attr.aria-pressed]="tema.tema() === 'claro'" aria-label="Tema claro" title="Claro" (click)="cambiarTema('claro')"><app-icon name="sol" [size]="15"></app-icon></button>
              <button type="button" [class.activo]="tema.tema() === 'sistema'" [attr.aria-pressed]="tema.tema() === 'sistema'" aria-label="Tema según el sistema" title="Según el sistema" (click)="cambiarTema('sistema')"><app-icon name="sistema" [size]="15"></app-icon></button>
              <button type="button" [class.activo]="tema.tema() === 'oscuro'" [attr.aria-pressed]="tema.tema() === 'oscuro'" aria-label="Tema oscuro" title="Oscuro" (click)="cambiarTema('oscuro')"><app-icon name="luna" [size]="15"></app-icon></button>
            </div>
          </div>
        </header>
        <main class="contenido" [class.contenido--ancho]="enVisor()">
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
      width: 256px; flex-shrink: 0;
      background: var(--surface); border-right: 1px solid var(--border);
      display: flex; flex-direction: column;
      position: sticky; top: 0; height: 100vh;
    }
    .marca { display: flex; align-items: center; gap: 11px; padding: 18px 16px 14px; position: relative; }
    .marca__img { width: 36px; height: 36px; object-fit: contain; border-radius: 9px; background: #fff; padding: 2px; border: 1px solid var(--border); }
    .marca--ancha { flex-direction: column; align-items: stretch; gap: 10px; }
    .marca--ancha .marca__img { width: 100%; height: 48px; padding: 8px 12px; border-radius: 10px; }
    .marca--ancha .marca__txt strong { display: none; }
    .marca__logo {
      width: 36px; height: 36px; border-radius: 9px;
      background: var(--brand-600); color: #fff;
      display: grid; place-items: center; font-weight: 700; font-size: 14px; letter-spacing: -.02em;
    }
    .marca__txt { display: flex; flex-direction: column; line-height: 1.25; min-width: 0; }
    .marca__txt strong { color: var(--text); font-weight: 600; font-size: 14px; letter-spacing: -.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .marca__txt span { font-size: 12px; color: var(--muted); }
    .sidebar__cerrar { display: none; margin-left: auto; background: transparent; color: var(--muted); border: 0; padding: 4px; height: auto; align-self: flex-start; }
    .sidebar__cerrar:hover { color: var(--text); background: transparent; }

    .nav { display: flex; flex-direction: column; gap: 18px; padding: 8px 12px; flex: 1; overflow-y: auto; }
    .nav__grupo { display: flex; flex-direction: column; gap: 2px; }
    .nav__rotulo { font-size: 11px; font-weight: 500; color: var(--faint); padding: 0 10px 6px; }
    .nav__item {
      display: flex; align-items: center; gap: 10px;
      height: 36px; padding: 0 10px; border-radius: 8px;
      color: var(--muted); text-decoration: none; font-size: 14px; font-weight: 500;
      transition: background .12s, color .12s;
    }
    .nav__item app-icon { color: var(--faint); transition: color .12s; }
    .nav__item:hover { background: var(--surface-2); color: var(--text); text-decoration: none; }
    .nav__item:hover app-icon { color: var(--text); }
    .nav__item.activo { background: var(--brand-100); color: var(--brand-700); font-weight: 600; }
    .nav__item.activo app-icon { color: var(--brand-600); }

    .sidebar__pie { padding: 12px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 10px; }
    .cuenta { display: flex; align-items: center; gap: 10px; padding: 6px 6px 6px 8px; border-radius: 10px; }
    .cuenta:hover { background: var(--surface-2); }
    .cuenta__avatar {
      width: 32px; height: 32px; border-radius: 50%; flex: none;
      background: var(--brand-600); color: #fff;
      display: grid; place-items: center; font-size: 13px; font-weight: 600;
    }
    .cuenta__txt { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; flex: 1; }
    .cuenta__txt strong { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cuenta__txt span { font-size: 11.5px; color: var(--muted); }
    .cuenta__salir { background: transparent; color: var(--faint); border: 0; width: 30px; height: 30px; padding: 0; border-radius: 8px; }
    .cuenta__salir:hover { background: var(--surface); color: var(--text); }
    .producto { font-size: 11px; color: var(--faint); padding: 0 8px; }

    .area { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    .banda-suplantacion {
      display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
      padding: 9px var(--sp-6);
      background: var(--warn-bg); color: var(--warn); border-bottom: 1px solid color-mix(in srgb, var(--warn) 25%, transparent);
      font-size: 13px; line-height: 1.45;
    }
    .banda-suplantacion strong { font-weight: 600; }
    .banda-suplantacion__salir {
      height: 30px; padding: 0 12px; border: 1px solid color-mix(in srgb, var(--warn) 45%, transparent); border-radius: 8px;
      background: transparent; color: var(--warn); font-size: 12.5px; cursor: pointer;
    }
    .banda-suplantacion__salir:hover { background: color-mix(in srgb, var(--warn) 12%, transparent); }

    .topbar {
      display: flex; align-items: center; justify-content: space-between;
      height: 56px; padding: 0 var(--sp-6); gap: var(--sp-3);
      background: color-mix(in srgb, var(--bg) 70%, transparent); backdrop-filter: blur(8px);
      position: sticky; top: 0; z-index: 20;
      border-bottom: 1px solid var(--border);
    }
    .contexto { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 13.5px; }
    .contexto__org { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .contexto__sep { color: var(--border-2); }
    .contexto__seccion { color: var(--text); font-weight: 500; white-space: nowrap; }
    .topbar__hamburguesa { display: none; background: transparent; color: var(--muted); border: 1px solid var(--border-2); width: 36px; height: 36px; padding: 0; }
    .topbar__hamburguesa:hover { background: var(--surface); color: var(--text); }

    .herramientas { display: flex; align-items: center; gap: 12px; }
    .tema-toggle { display: flex; border: 1px solid var(--border); border-radius: 9px; overflow: hidden; background: var(--surface); padding: 2px; gap: 2px; }
    .tema-toggle button { background: transparent; color: var(--muted); border: 0; border-radius: 7px; width: 30px; height: 28px; padding: 0; }
    .tema-toggle button:hover { background: var(--surface-2); color: var(--text); }
    .tema-toggle button.activo { background: var(--surface-2); color: var(--text); box-shadow: var(--sh-1); }

    .contenido { padding: var(--sp-6); flex: 1; max-width: 1320px; width: 100%; }
    .contenido--ancho { max-width: none; padding: var(--sp-4) var(--sp-5); }

    .overlay--sidebar { z-index: 940; }

    @media (max-width: 880px) {
      .sidebar {
        position: fixed; inset: 0 auto 0 0; z-index: 950; height: 100vh;
        transform: translateX(-100%); transition: transform .22s cubic-bezier(.2,.8,.2,1);
        box-shadow: none;
      }
      .sidebar.abierta { transform: translateX(0); box-shadow: var(--sh-pop); }
      .sidebar__cerrar { display: inline-flex; }
      .topbar__hamburguesa { display: inline-flex; }
      .topbar { padding: 0 var(--sp-4); }
      .contenido { padding: var(--sp-4); }
    }
  `],
})
export class LayoutComponent {
  readonly auth = inject(AuthService);
  readonly tenant = inject(TenantService);
  readonly tema = inject(ThemeService);
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  /** True en /<hash>/tableros/<clave>: el visor ocupa todo el ancho disponible. */
  readonly enVisor = computed(() => /\/tableros\/[^/]+/.test(this.url()));

  readonly menuAbierto = signal(false);

  private readonly items: ItemNav[] = [
    { ruta: 'inicio', etiqueta: 'Inicio', icono: 'inicio', grupo: 'Explorar' },
    { ruta: 'tableros', etiqueta: 'Tableros', icono: 'grafico', grupo: 'Explorar' },
    { ruta: 'chatbot', etiqueta: 'Asistente', icono: 'chatbot', grupo: 'Autoservicio', soloAsistente: true },
    { ruta: 'mi-tablero', etiqueta: 'Mi tablero', icono: 'tablero', grupo: 'Autoservicio', soloAsistente: true },
    { ruta: 'descargas', etiqueta: 'Descargas', icono: 'descargar', grupo: 'Autoservicio' },
    { ruta: 'admin', etiqueta: 'Administración', icono: 'admin', grupo: 'Organización', soloAdmin: true },
  ];

  readonly grupos = computed(() => {
    const esAdmin = this.auth.usuario()?.esAdmin ?? false;
    const asistente = this.tenant.moduloAsistente();
    const visibles = this.items.filter((i) => (!i.soloAdmin || esAdmin) && (!i.soloAsistente || asistente));
    const orden: ItemNav['grupo'][] = ['Explorar', 'Autoservicio', 'Organización'];
    return orden
      .map((nombre) => ({ nombre, items: visibles.filter((i) => i.grupo === nombre) }))
      .filter((g) => g.items.length > 0);
  });

  /** Nombre de la sección activa para la franja superior. */
  readonly seccionActual = computed(() => {
    const u = this.url();
    const item = this.items.find((i) => u.includes(`/${i.ruta}`));
    return item?.etiqueta ?? null;
  });

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
