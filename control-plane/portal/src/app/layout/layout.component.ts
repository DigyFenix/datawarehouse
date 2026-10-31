import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { AuthService } from '../core/auth.service';
import { OrganizacionService } from '../core/organizacion.service';
import { ToastHostComponent } from '../core/toast-host.component';
import { ConfirmComponent } from '../ui/confirm.component';
import { IconComponent } from '../ui/icon.component';

type GrupoNav = 'Clientes' | 'Datos' | 'Semántica' | 'Acceso';

interface ItemNav {
  ruta: string;
  etiqueta: string;
  icono: string; // path SVG (24x24)
  grupo: GrupoNav;
  /** La pantalla depende de la organización activa (se muestra su nombre al lado). */
  porOrganizacion?: boolean;
}

/**
 * Cascarón del plano de control (sesión 37): mismo sistema visual «Espacio de trabajo» que el
 * portal de usuario — barra lateral clara, menú por grupos en el orden en que se usa (primero
 * los clientes, luego datos, semántica y acceso), franja superior con la organización que se
 * está configurando y la cuenta del operador al pie. Sin eyebrows en mono ni pie de «dev».
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
        <div class="marca">
          <div class="marca__logo">Q</div>
          <div class="marca__txt">
            <strong>Quilate Analytics</strong>
            <span>Plano de control</span>
          </div>
          <button class="sidebar__cerrar" (click)="menuAbierto.set(false)" aria-label="Cerrar menú">
            <app-icon name="cerrar" [size]="18"></app-icon>
          </button>
        </div>

        <nav class="nav">
          @for (g of grupos; track g.nombre) {
            <div class="nav__grupo">
              <span class="nav__rotulo">{{ g.nombre }}</span>
              @for (i of g.items; track i.ruta) {
                <a class="nav__item" [routerLink]="i.ruta" routerLinkActive="activo" (click)="menuAbierto.set(false)">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path [attr.d]="i.icono"></path>
                  </svg>
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
              <span>Proveedor</span>
            </div>
            <button class="cuenta__salir" (click)="salir()" title="Cerrar sesión" aria-label="Cerrar sesión">
              <app-icon name="salir" [size]="16"></app-icon>
            </button>
          </div>
        </div>
      </aside>

      <div class="area">
        <header class="topbar">
          <div class="contexto">
            <button class="topbar__hamburguesa" (click)="menuAbierto.set(true)" aria-label="Abrir menú">
              <app-icon name="menu" [size]="20"></app-icon>
            </button>
            @if (seccionActual(); as s) {
              <span class="contexto__seccion">{{ s.etiqueta }}</span>
              @if (s.porOrganizacion) {
                <span class="contexto__sep" aria-hidden="true">/</span>
                <span class="contexto__org">{{ orgs.activa()?.nombre ?? 'sin organización' }}</span>
              } @else if (s.ruta !== '/organizaciones') {
                <span class="contexto__nota">Catálogo del producto · aplica a todas las organizaciones</span>
              }
            }
          </div>
          <!-- Organización activa: fija el tenant que se configura en Conexiones, Sociedades,
               Ingesta y Portal usuario. Sin esto las pantallas mezclarían dos ERPs. -->
          <label class="selector-org">
            <span class="selector-org__etq">Configurando</span>
            <select [value]="orgs.activaId() ?? ''" (change)="cambiarOrganizacion($event)" aria-label="Organización que se está configurando">
              @for (o of orgs.organizaciones(); track o.id) {
                <option [value]="o.id">{{ o.nombre }}</option>
              }
              @if (!orgs.organizaciones().length) {
                <option value="">Sin organizaciones</option>
              }
            </select>
          </label>
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
      width: 256px; flex-shrink: 0;
      background: var(--surface); border-right: 1px solid var(--border);
      display: flex; flex-direction: column;
      position: sticky; top: 0; height: 100vh;
    }
    .marca { display: flex; align-items: center; gap: 11px; padding: 18px 16px 14px; }
    .marca__logo {
      width: 36px; height: 36px; border-radius: 9px; flex: none;
      background: var(--brand-600); color: #fff;
      display: grid; place-items: center; font-weight: 700; font-size: 15px;
    }
    .marca__txt { display: flex; flex-direction: column; line-height: 1.25; min-width: 0; }
    .marca__txt strong { color: var(--text); font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .marca__txt span { font-size: 12px; color: var(--muted); }
    .sidebar__cerrar { display: none; margin-left: auto; background: transparent; color: var(--muted); border: 0; padding: 4px; min-height: 0; align-self: flex-start; }

    .nav { display: flex; flex-direction: column; gap: 18px; padding: 8px 12px; flex: 1; overflow-y: auto; }
    .nav__grupo { display: flex; flex-direction: column; gap: 2px; }
    .nav__rotulo { font-size: 11px; font-weight: 500; color: var(--faint); padding: 0 10px 6px; }
    .nav__item {
      display: flex; align-items: center; gap: 10px;
      height: 36px; padding: 0 10px; border-radius: 8px;
      color: var(--muted); text-decoration: none; font-size: 14px; font-weight: 500;
      transition: background .12s, color .12s;
    }
    .nav__item svg { color: var(--faint); flex: none; }
    .nav__item:hover { background: var(--surface-2); color: var(--text); text-decoration: none; }
    .nav__item:hover svg { color: var(--text); }
    .nav__item.activo { background: var(--brand-100); color: var(--brand-700); font-weight: 600; }
    .nav__item.activo svg { color: var(--brand-600); }

    .sidebar__pie { padding: 12px; border-top: 1px solid var(--border); }
    .cuenta { display: flex; align-items: center; gap: 10px; padding: 6px 6px 6px 8px; border-radius: 10px; }
    .cuenta:hover { background: var(--surface-2); }
    .cuenta__avatar { width: 32px; height: 32px; border-radius: 50%; flex: none; background: var(--brand-600); color: #fff; display: grid; place-items: center; font-size: 13px; font-weight: 600; }
    .cuenta__txt { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; flex: 1; }
    .cuenta__txt strong { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cuenta__txt span { font-size: 11.5px; color: var(--muted); }
    .cuenta__salir { background: transparent; color: var(--faint); border: 0; width: 30px; height: 30px; min-height: 0; padding: 0; border-radius: 8px; }
    .cuenta__salir:hover { background: var(--surface); color: var(--text); }

    .area { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    .topbar {
      display: flex; align-items: center; justify-content: space-between;
      height: 56px; padding: 0 var(--sp-6); gap: var(--sp-3);
      background: color-mix(in srgb, var(--bg) 70%, transparent); backdrop-filter: blur(8px);
      position: sticky; top: 0; z-index: 20; border-bottom: 1px solid var(--border);
    }
    .contexto { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 13.5px; }
    .contexto__seccion { color: var(--text); font-weight: 500; white-space: nowrap; }
    .contexto__sep { color: var(--border-2); }
    .contexto__org { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .contexto__nota { color: var(--faint); font-size: var(--fs-xs); white-space: nowrap; }
    .topbar__hamburguesa { display: none; background: transparent; color: var(--muted); border: 1px solid var(--border-2); width: 36px; height: 36px; min-height: 0; padding: 0; }

    .selector-org { display: flex; align-items: center; gap: 8px; }
    .selector-org__etq { font-size: var(--fs-xs); color: var(--muted); white-space: nowrap; }
    .selector-org select { min-height: 34px; padding: 4px 30px 4px 10px; font-size: 13px; font-weight: 500; max-width: 260px; border-radius: 8px; }

    .contenido { padding: var(--sp-6); flex: 1; max-width: 1320px; width: 100%; }
    .overlay--sidebar { z-index: 940; }

    @media (max-width: 880px) {
      .sidebar { position: fixed; inset: 0 auto 0 0; z-index: 950; height: 100vh; transform: translateX(-100%); transition: transform .22s cubic-bezier(.2,.8,.2,1); }
      .sidebar.abierta { transform: translateX(0); box-shadow: var(--sh-pop); }
      .sidebar__cerrar { display: inline-flex; }
      .topbar__hamburguesa { display: inline-flex; }
      .topbar { padding: 0 var(--sp-4); }
      .contexto__nota { display: none; }
      .contenido { padding: var(--sp-4); }
    }
  `],
})
export class LayoutComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly orgs = inject(OrganizacionService);
  private readonly router = inject(Router);

  readonly menuAbierto = signal(false);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  ngOnInit(): void {
    // Carga las organizaciones y fija la activa (persistida o la primera). El color de
    // marca del tenant se aplica dentro del servicio (white-label).
    this.orgs.cargar().subscribe({ error: () => {} });
  }

  cambiarOrganizacion(evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value;
    this.orgs.seleccionar(valor ? Number(valor) : null);
  }

  // Orden = orden de trabajo: dar de alta un cliente va de arriba hacia abajo en «Clientes».
  readonly items: ItemNav[] = [
    { ruta: '/organizaciones', etiqueta: 'Organizaciones', grupo: 'Clientes', icono: 'M3 21h18M6 21V7l6-4 6 4v14M10 9h4M10 13h4M10 17h4' },
    { ruta: '/conexiones', etiqueta: 'Conexiones al ERP', grupo: 'Clientes', porOrganizacion: true, icono: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' },
    { ruta: '/sociedades', etiqueta: 'Sociedades', grupo: 'Clientes', porOrganizacion: true, icono: 'M3 21h18M9 8h1m-1 4h1m4-4h1m-1 4h1M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16' },
    { ruta: '/portal-usuario', etiqueta: 'Portal del cliente', grupo: 'Clientes', porOrganizacion: true, icono: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zM8 21h8M12 17v4' },
    { ruta: '/ingesta', etiqueta: 'Ingesta', grupo: 'Datos', porOrganizacion: true, icono: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.27 6.96 12 12.01l8.73-5.05 M12 22.08V12' },
    { ruta: '/canonico', etiqueta: 'Modelo canónico', grupo: 'Datos', icono: 'M4 7V4h16v3M9 20h6M12 4v16' },
    { ruta: '/metricas', etiqueta: 'Métricas', grupo: 'Semántica', icono: 'M3 3v18h18M7 15l3-4 3 3 5-7' },
    { ruta: '/glosario', etiqueta: 'Glosario', grupo: 'Semántica', icono: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' },
    { ruta: '/usuarios', etiqueta: 'Usuarios y roles', grupo: 'Acceso', icono: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
    { ruta: '/autorizaciones', etiqueta: 'Autorizaciones', grupo: 'Acceso', icono: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4' },
    { ruta: '/auditoria', etiqueta: 'Auditoría', grupo: 'Acceso', icono: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
  ];

  readonly grupos = (['Clientes', 'Datos', 'Semántica', 'Acceso'] as GrupoNav[]).map((nombre) => ({
    nombre,
    items: this.items.filter((i) => i.grupo === nombre),
  }));

  /** Sección activa para la franja superior (y si depende de la organización activa). */
  readonly seccionActual = computed(() => {
    const u = this.url();
    return this.items.find((i) => u.startsWith(i.ruta)) ?? (u.startsWith('/campos') ? this.items.find((i) => i.ruta === '/ingesta') ?? null : null);
  });

  inicial(): string {
    return (this.auth.usuario()?.nombre ?? '?').charAt(0).toUpperCase();
  }

  salir(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
