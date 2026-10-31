import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { DrawerComponent } from '../../core/drawer.component';
import { AlcancePerfil, CatalogoAlcances, PerfilOrg, TableroAdmin } from '../../core/modelos';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../ui/confirm.service';
import { EmptyComponent } from '../../ui/empty.component';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { SkeletonComponent } from '../../ui/skeleton.component';
import { TabsComponent } from '../../ui/tabs.component';
import { PESTANAS_ADMIN } from './pestanas';

interface FormPerfil {
  clave: string;
  nombre: string;
  descripcion: string;
  activo: boolean;
}

/**
 * Perfiles de acceso de la organización: qué tableros ve cada perfil y — para
 * el chatbot futuro — qué dominios/métricas podrá consultar (alcances).
 */
@Component({
  selector: 'app-admin-perfiles',
  standalone: true,
  imports: [FormsModule, DrawerComponent, TabsComponent, PageHeaderComponent, SkeletonComponent, EmptyComponent, IconComponent],
  template: `
    <app-page-header eyebrow="Administración" titulo="Perfiles">
      <button acciones (click)="nuevo()">+ Nuevo perfil</button>
    </app-page-header>
    <app-tabs [baseRuta]="['/', tenant.hash(), 'admin']" [items]="pestanas"></app-tabs>

    <div class="tarjeta tarjeta--tabla">
      <div class="tabla-wrap tabla-responsive">
        <table>
          <thead><tr><th scope="col">Perfil</th><th scope="col">Tableros</th>@if (tenant.moduloAsistente()) { <th scope="col">Alcances (asistente)</th> }<th scope="col">Usuarios</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
          <tbody>
            @if (cargando()) {
              <app-skeleton variante="fila-tabla" [columnas]="6"></app-skeleton>
              <app-skeleton variante="fila-tabla" [columnas]="6"></app-skeleton>
              <app-skeleton variante="fila-tabla" [columnas]="6"></app-skeleton>
            } @else {
              @for (p of perfiles(); track p.id) {
                <tr>
                  <td data-label="Perfil"><strong>{{ p.nombre }}</strong><br /><code class="sutil">{{ p.clave }}</code></td>
                  <td data-label="Tableros">{{ p.tableroIds.length }}</td>
                  @if (tenant.moduloAsistente()) {
                    <td data-label="Alcances">
                      @for (a of p.alcances; track a.recursoTipo + a.recursoClave) {
                        <span class="chip">{{ a.recursoTipo }}: {{ a.recursoClave }}</span>
                      }
                      @if (!p.alcances.length) { <span class="sutil">—</span> }
                    </td>
                  }
                  <td data-label="Usuarios">{{ p.usuarios }}</td>
                  <td data-label="Estado">@if (p.activo) { <span class="ok">activo</span> } @else { <span class="sutil">inactivo</span> }</td>
                  <td data-label="Acciones" class="col-acciones">
                    <details class="menu-acciones">
                      <summary [attr.aria-label]="'Acciones para ' + p.nombre"><app-icon name="menu" [size]="16"></app-icon></summary>
                      <div class="menu-acciones__lista">
                        <button type="button" (click)="editar(p); cerrarMenu($event)"><app-icon name="editar" [size]="15"></app-icon> Editar</button>
                        <button type="button" (click)="abrirTableros(p); cerrarMenu($event)"><app-icon name="grafico" [size]="15"></app-icon> Tableros</button>
                        @if (tenant.moduloAsistente()) {
                          <button type="button" (click)="abrirAlcances(p); cerrarMenu($event)"><app-icon name="externo" [size]="15"></app-icon> Alcances</button>
                        }
                        <button type="button" class="peligro" (click)="eliminar(p); cerrarMenu($event)"><app-icon name="papelera" [size]="15"></app-icon> Eliminar</button>
                      </div>
                    </details>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6"><app-empty titulo="Sin perfiles">Crea perfiles (gerencia, finanzas, ventas…) y asígnales tableros.</app-empty></td></tr>
              }
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (drawerPerfil()) {
      <app-drawer [titulo]="edicionId() ? 'Editar perfil' : 'Nuevo perfil'" eyebrow="Perfiles" (cerrar)="drawerPerfil.set(false)">
        <form (ngSubmit)="guardar()">
          <div class="campo">
            <label>Clave</label>
            <input name="clave" [(ngModel)]="form.clave" required placeholder="gerencia" [disabled]="!!edicionId()" />
            <span class="sutil">Minúsculas, números y guion bajo.</span>
          </div>
          <div class="campo"><label>Nombre</label><input name="nombre" [(ngModel)]="form.nombre" required placeholder="Gerencia" /></div>
          <div class="campo"><label>Descripción</label><input name="descripcion" [(ngModel)]="form.descripcion" /></div>
          <label class="check"><input type="checkbox" name="activo" [(ngModel)]="form.activo" /> Activo</label>
          @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
          <div class="acciones-fila">
            <button type="button" class="secundario" (click)="drawerPerfil.set(false)">Cancelar</button>
            <button type="submit" [disabled]="guardando()">
              @if (guardando()) { <span class="spinner"></span> }
              {{ guardando() ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </form>
      </app-drawer>
    }

    @if (drawerTableros()) {
      <app-drawer titulo="Tableros del perfil" [eyebrow]="seleccionado()?.nombre ?? ''" (cerrar)="drawerTableros.set(false)">
        <div class="sel-cabecera">
          <div>
            <strong>{{ tablerosSeleccionados().length }}</strong> <span class="sutil">de {{ tablerosActivos().length }} tableros</span>
            <p class="ayuda">Los usuarios con este perfil verán los tableros marcados.</p>
          </div>
          <div class="sel-acciones">
            <button type="button" class="enlace" (click)="marcarTodos(true)">Todos</button>
            <button type="button" class="enlace" (click)="marcarTodos(false)">Ninguno</button>
          </div>
        </div>
        @if (otrosPerfilesConTableros().length) {
          <label class="sel-copiar">
            <span>Copiar de otro perfil</span>
            <select [ngModel]="''" (ngModelChange)="copiarDePerfil($event)" name="copiarDe" aria-label="Copiar tableros de otro perfil">
              <option value="" disabled>Elegir perfil…</option>
              @for (o of otrosPerfilesConTableros(); track o.id) { <option [value]="o.id">{{ o.nombre }} ({{ o.tableroIds.length }})</option> }
            </select>
          </label>
        }
        @if (tableros().length > 8) {
          <input class="sel-buscar" type="search" placeholder="Buscar tablero…" [ngModel]="filtroTablero()" (ngModelChange)="filtroTablero.set($event)" name="filtroTablero" aria-label="Buscar tablero" />
        }
        @for (g of gruposTableros(); track g.modulo) {
          <section class="sel-grupo">
            <header>
              <h4>{{ g.modulo }} <span class="sutil">{{ g.marcados }}/{{ g.activos }}</span></h4>
              <button type="button" class="enlace" (click)="marcarGrupo(g.modulo, g.marcados < g.activos)">
                {{ g.marcados < g.activos ? 'Marcar todos' : 'Quitar todos' }}
              </button>
            </header>
            <div class="sel-lista">
              @for (t of g.tableros; track t.id) {
                <button type="button" class="sel-item" [class.sel-item--on]="tablerosSeleccionados().includes(t.id)" [disabled]="!t.activo"
                        role="checkbox" [attr.aria-checked]="tablerosSeleccionados().includes(t.id)" (click)="alternarTablero(t.id)">
                  <span class="sel-caja" aria-hidden="true">
                    <svg viewBox="0 0 16 16" width="12" height="12"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </span>
                  <span class="sel-texto">
                    <span class="sel-nombre">{{ t.nombre }} @if (!t.activo) { <span class="sel-inactivo">inactivo</span> }</span>
                    @if (t.descripcion) { <span class="sel-desc">{{ t.descripcion }}</span> }
                  </span>
                </button>
              }
            </div>
          </section>
        } @empty {
          <p class="sutil">@if (tableros().length) { Ningún tablero coincide con la búsqueda. } @else { El proveedor aún no ha dado de alta tableros para tu organización. }</p>
        }
        @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
        <div class="acciones-fila sel-pie">
          <span class="sutil" aria-live="polite">
            @if (cambiosTableros() === 0) { Sin cambios } @else { {{ cambiosTableros() }} {{ cambiosTableros() === 1 ? 'cambio' : 'cambios' }} sin guardar }
          </span>
          <button type="button" class="secundario" (click)="drawerTableros.set(false)">Cancelar</button>
          <button (click)="guardarTableros()" [disabled]="guardando() || cambiosTableros() === 0" [attr.aria-busy]="guardando()">
            @if (guardando()) { <span class="spinner"></span> }
            {{ guardando() ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>
      </app-drawer>
    }

    @if (drawerAlcances()) {
      <app-drawer titulo="Qué puede consultar en el asistente" [eyebrow]="seleccionado()?.nombre ?? ''" (cerrar)="drawerAlcances.set(false)">
        @if (!catalogo()) {
          <app-skeleton variante="fila-tabla" [columnas]="1"></app-skeleton>
        } @else {
          <section class="alc-seccion">
            <header>
              <h4>Empresas</h4>
              <p class="ayuda">De qué sociedades ve datos este perfil. Sin ninguna, el asistente no responde nada.</p>
            </header>
            <button type="button" class="sel-item sel-item--compacto" [class.sel-item--on]="empresasTodas()" role="checkbox" [attr.aria-checked]="empresasTodas()" (click)="alternarEmpresasTodas()">
              <span class="sel-caja" aria-hidden="true"><svg viewBox="0 0 16 16" width="12" height="12"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
              <span class="sel-texto"><span class="sel-nombre">Todas las empresas</span><span class="sel-desc">Incluye las que se agreguen en el futuro</span></span>
            </button>
            @if (!empresasTodas()) {
              <div class="alc-chips">
                @for (e of catalogo()!.empresas; track e.clave) {
                  <button type="button" class="chip-sel" [class.chip-sel--on]="empresasSel().has(e.clave)" (click)="alternarEmpresa(e.clave)" [attr.aria-pressed]="empresasSel().has(e.clave)">{{ e.nombre }}</button>
                } @empty { <p class="sutil">El warehouse aún no tiene empresas cargadas.</p> }
              </div>
            }
          </section>

          <section class="alc-seccion">
            <header>
              <h4>Métricas</h4>
              <p class="ayuda">Qué indicadores puede preguntar. Por dominio es lo habitual; las métricas sueltas sirven para excepciones.</p>
            </header>
            <button type="button" class="sel-item sel-item--compacto" [class.sel-item--on]="catalogoTodo()" role="checkbox" [attr.aria-checked]="catalogoTodo()" (click)="alternarCatalogoTodo()">
              <span class="sel-caja" aria-hidden="true"><svg viewBox="0 0 16 16" width="12" height="12"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
              <span class="sel-texto"><span class="sel-nombre">Todo el catálogo</span><span class="sel-desc">{{ totalMetricas() }} métricas en {{ catalogo()!.dominios.length }} dominios, y las que se certifiquen después</span></span>
            </button>
            @if (!catalogoTodo()) {
              <div class="alc-chips">
                @for (d of catalogo()!.dominios; track d.clave) {
                  <button type="button" class="chip-sel" [class.chip-sel--on]="dominiosSel().has(d.clave)" (click)="alternarDominio(d.clave)" [attr.aria-pressed]="dominiosSel().has(d.clave)">
                    {{ nombreDominio(d.clave) }} <span class="chip-sel__n">{{ d.metricas.length }}</span>
                  </button>
                }
              </div>
              <details class="alc-sueltas" [open]="metricasSel().size > 0">
                <summary>Métricas sueltas @if (metricasSel().size) { <span class="sutil">· {{ metricasSel().size }} elegidas</span> }</summary>
                @for (d of catalogo()!.dominios; track d.clave) {
                  @if (!dominiosSel().has(d.clave)) {
                    <p class="alc-sub">{{ nombreDominio(d.clave) }}</p>
                    @for (m of d.metricas; track m.clave) {
                      <label class="check check--fino">
                        <input type="checkbox" [checked]="metricasSel().has(m.clave)" (change)="alternarMetrica(m.clave)" />
                        {{ m.nombre }} @if (m.estado !== 'certificada') { <span class="sel-inactivo">{{ m.estado }}</span> }
                      </label>
                    }
                  }
                }
              </details>
            }
          </section>
        }
        @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
        @if (catalogo() && !empresasTodas() && empresasSel().size === 0) { <p class="aviso">Sin empresa, este perfil no verá ningún dato en el asistente.</p> }
        <div class="acciones-fila sel-pie">
          <span class="sutil" aria-live="polite">
            @if (cambiosAlcances() === 0) { Sin cambios } @else { {{ cambiosAlcances() }} {{ cambiosAlcances() === 1 ? 'cambio' : 'cambios' }} sin guardar }
          </span>
          <button type="button" class="secundario" (click)="drawerAlcances.set(false)">Cancelar</button>
          <button (click)="guardarAlcances()" [disabled]="guardando() || cambiosAlcances() === 0" [attr.aria-busy]="guardando()">
            @if (guardando()) { <span class="spinner"></span> }
            {{ guardando() ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>
      </app-drawer>
    }
  `,
  styles: [`
    .ayuda { margin: 0 0 12px; font-size: var(--fs-sm); color: var(--muted); }
    .sutil { font-size: var(--fs-xs); color: var(--faint); }
    .check { display: flex; align-items: center; gap: 8px; font-size: var(--fs-base); margin: 8px 0; color: var(--muted); }
    .chip { display: inline-block; background: var(--brand-100); color: var(--brand-700); border-radius: 999px; padding: 2px 9px; font-size: var(--fs-xs); margin: 1px 3px 1px 0; }
    .ok { color: var(--ok); }
    .fila-alcance { display: grid; grid-template-columns: 110px 1fr auto; gap: 8px; margin-bottom: 8px; align-items: center; }
    /* Selector de tableros (sesión 37): tarjetas clicables agrupadas por módulo, sin checkboxes sueltos. */
    .sel-cabecera { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
    .sel-cabecera strong { font-size: 22px; font-weight: 600; line-height: 1; }
    .sel-cabecera .ayuda { margin: 6px 0 0; }
    .sel-acciones { display: flex; gap: 12px; white-space: nowrap; }
    .enlace { background: none; border: 0; padding: 0; min-height: 0; color: var(--brand-700); font-size: var(--fs-sm); font-weight: 500; cursor: pointer; }
    .enlace:hover { text-decoration: underline; }
    .sel-buscar { width: 100%; margin-bottom: 14px; }
    .sel-grupo { margin-bottom: 16px; }
    .sel-grupo header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
    .sel-grupo h4 { margin: 0; font-size: var(--fs-sm); font-weight: 600; color: var(--muted); }
    .sel-grupo h4 .sutil { font-weight: 500; margin-left: 4px; }
    .sel-lista { display: grid; gap: 6px; }
    .sel-item { display: flex; align-items: flex-start; justify-content: flex-start; gap: 10px; width: 100%; text-align: left; padding: 10px 12px; min-height: 0; font-weight: 400;
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-sm); color: var(--text); cursor: pointer; transition: border-color .12s, background .12s; }
    .sel-item:hover:not(:disabled) { border-color: var(--border-2); background: var(--surface-2); }
    .sel-item:focus-visible { outline: 2px solid var(--brand-400); outline-offset: 1px; }
    .sel-item:disabled { opacity: .55; cursor: not-allowed; }
    .sel-item--on { border-color: var(--brand-400); background: var(--brand-50); }
    .sel-caja { flex: 0 0 18px; width: 18px; height: 18px; margin-top: 1px; border-radius: 5px; border: 1.5px solid var(--border-2); background: var(--surface); display: grid; place-items: center; color: transparent; transition: all .12s; }
    .sel-item--on .sel-caja { background: var(--brand-600); border-color: var(--brand-600); color: #fff; }
    .sel-texto { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .sel-nombre { font-size: var(--fs-base); font-weight: 500; }
    .sel-desc { font-size: var(--fs-xs); color: var(--muted); line-height: 1.35; }
    .sel-inactivo { font-size: var(--fs-2xs); color: var(--faint); background: var(--surface-2); border-radius: 999px; padding: 1px 7px; margin-left: 4px; vertical-align: middle; }
    .sel-copiar { display: flex; align-items: center; gap: 10px; margin: 0 0 14px; font-size: var(--fs-sm); color: var(--muted); }
    .sel-copiar select { flex: 1; min-height: 34px; }
    .sel-pie { align-items: center; }
    .sel-pie .sutil { margin-right: auto; }
    .alc-seccion { margin-bottom: 20px; }
    .alc-seccion header { margin-bottom: 8px; }
    .alc-seccion h4 { margin: 0 0 2px; font-size: var(--fs-base); font-weight: 600; }
    .alc-seccion .ayuda { margin: 0; }
    .sel-item--compacto { margin-bottom: 8px; }
    .alc-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip-sel { min-height: 0; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--border-2); background: var(--surface); color: var(--text); font-size: var(--fs-sm); font-weight: 500; cursor: pointer; }
    .chip-sel:hover { background: var(--surface-2); }
    .chip-sel--on { background: var(--brand-600); border-color: var(--brand-600); color: #fff; }
    .chip-sel__n { opacity: .7; font-weight: 400; margin-left: 2px; }
    .alc-sueltas { margin-top: 10px; border: 1px solid var(--border); border-radius: var(--r-sm); padding: 8px 12px; }
    .alc-sueltas summary { cursor: pointer; font-size: var(--fs-sm); font-weight: 500; color: var(--muted); }
    .alc-sub { margin: 10px 0 2px; font-size: var(--fs-xs); font-weight: 600; color: var(--faint); }
    .check--fino { margin: 4px 0; font-size: var(--fs-sm); }
    .aviso { margin: 8px 0; padding: 8px 12px; border-radius: var(--r-sm); background: var(--warn-bg); color: var(--warn); font-size: var(--fs-sm); }
    .sr-solo { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  `],
})
export class PerfilesComponent {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  readonly tenant = inject(TenantService);

  readonly pestanas = PESTANAS_ADMIN;
  readonly perfiles = signal<PerfilOrg[]>([]);
  readonly tableros = signal<TableroAdmin[]>([]);
  readonly cargando = signal(true);
  readonly drawerPerfil = signal(false);
  readonly drawerTableros = signal(false);
  readonly drawerAlcances = signal(false);
  readonly edicionId = signal<number | null>(null);
  readonly seleccionado = signal<PerfilOrg | null>(null);
  readonly tablerosSeleccionados = signal<number[]>([]);
  readonly filtroTablero = signal('');
  /** Marcas originales del perfil abierto: contra ellas se cuentan los cambios sin guardar. */
  private readonly tablerosOriginales = signal<number[]>([]);
  readonly cambiosTableros = computed(() => {
    const a = new Set(this.tablerosOriginales());
    const b = new Set(this.tablerosSeleccionados());
    let n = 0;
    for (const id of a) if (!b.has(id)) n += 1;
    for (const id of b) if (!a.has(id)) n += 1;
    return n;
  });
  readonly otrosPerfilesConTableros = computed(() => {
    const actual = this.seleccionado()?.id;
    return this.perfiles().filter((p) => p.id !== actual && p.tableroIds.length > 0);
  });
  readonly tablerosActivos = computed(() => this.tableros().filter((t) => t.activo));
  /** Tableros agrupados por familia (`grupo`, la misma que ve el usuario en Inicio; orden del catálogo), filtrados por el buscador, con conteo de marcados. */
  readonly gruposTableros = computed(() => {
    const q = this.filtroTablero().trim().toLowerCase();
    const marcados = new Set(this.tablerosSeleccionados());
    const grupos = new Map<string, TableroAdmin[]>();
    for (const t of this.tableros()) {
      if (q && !`${t.nombre} ${t.descripcion ?? ''}`.toLowerCase().includes(q)) continue;
      // Sin `grupo` (tenants anteriores a la migración 135) la familia se deduce del prefijo «Ventas · Histórico».
      const familia = t.grupo ?? (t.nombre.includes(' · ') ? t.nombre.split(' · ')[0] : 'Otros');
      const lista = grupos.get(familia) ?? [];
      lista.push(t);
      grupos.set(familia, lista);
    }
    return [...grupos.entries()].map(([modulo, tableros]) => ({
      modulo,
      tableros,
      activos: tableros.filter((t) => t.activo).length,
      marcados: tableros.filter((t) => t.activo && marcados.has(t.id)).length,
    }));
  });
  readonly alcancesEdicion = signal<AlcancePerfil[]>([]);
  // Alcances como estado estructurado (sesión 37): el admin elige con chips, no escribe claves.
  readonly catalogo = signal<CatalogoAlcances | null>(null);
  readonly empresasTodas = signal(false);
  readonly empresasSel = signal<Set<string>>(new Set());
  readonly catalogoTodo = signal(false);
  readonly dominiosSel = signal<Set<string>>(new Set());
  readonly metricasSel = signal<Set<string>>(new Set());
  private readonly alcancesOriginales = signal<string[]>([]);
  readonly totalMetricas = computed(() => (this.catalogo()?.dominios ?? []).reduce((n, d) => n + d.metricas.length, 0));
  /** Alcances que se guardarían ahora, normalizados y ordenados (para contar cambios y enviar). */
  readonly alcancesActuales = computed<AlcancePerfil[]>(() => {
    const lista: AlcancePerfil[] = [];
    if (this.empresasTodas()) lista.push({ recursoTipo: 'empresa', recursoClave: '*' });
    else for (const c of [...this.empresasSel()].sort()) lista.push({ recursoTipo: 'empresa', recursoClave: c });
    if (this.catalogoTodo()) lista.push({ recursoTipo: 'metrica', recursoClave: '*' });
    else {
      for (const c of [...this.dominiosSel()].sort()) lista.push({ recursoTipo: 'dominio', recursoClave: c });
      for (const c of [...this.metricasSel()].sort()) lista.push({ recursoTipo: 'metrica', recursoClave: c });
    }
    return lista;
  });
  readonly cambiosAlcances = computed(() => {
    const a = new Set(this.alcancesOriginales());
    const b = new Set(this.alcancesActuales().map((x) => `${x.recursoTipo}:${x.recursoClave}`));
    let n = 0;
    for (const k of a) if (!b.has(k)) n += 1;
    for (const k of b) if (!a.has(k)) n += 1;
    return n;
  });
  readonly errorForm = signal<string | null>(null);
  readonly guardando = signal(false);

  form: FormPerfil = this.vacio();

  constructor() {
    this.cargar();
  }

  private vacio(): FormPerfil {
    return { clave: '', nombre: '', descripcion: '', activo: true };
  }

  cargar(): void {
    this.cargando.set(true);
    this.api.get<PerfilOrg[]>('/admin/perfiles').subscribe({
      next: (d) => {
        this.perfiles.set(d);
        this.cargando.set(false);
      },
      error: (e: Error) => {
        this.toast.error('No se pudieron cargar los perfiles', e.message);
        this.cargando.set(false);
      },
    });
    this.api.get<TableroAdmin[]>('/admin/tableros').subscribe({
      next: (d) => this.tableros.set(d),
      error: () => {},
    });
  }

  /** Cierra el <details> de acciones tras elegir una opción del menú. */
  cerrarMenu(evento: Event): void {
    (evento.currentTarget as HTMLElement)?.closest('details')?.removeAttribute('open');
  }

  nuevo(): void {
    this.form = this.vacio();
    this.edicionId.set(null);
    this.errorForm.set(null);
    this.drawerPerfil.set(true);
  }

  editar(p: PerfilOrg): void {
    this.form = { clave: p.clave, nombre: p.nombre, descripcion: p.descripcion ?? '', activo: p.activo };
    this.edicionId.set(p.id);
    this.errorForm.set(null);
    this.drawerPerfil.set(true);
  }

  guardar(): void {
    this.errorForm.set(null);
    this.guardando.set(true);
    const id = this.edicionId();
    const cuerpo = {
      nombre: this.form.nombre,
      descripcion: this.form.descripcion || undefined,
      activo: this.form.activo,
      ...(id ? {} : { clave: this.form.clave }),
    };
    const accion = id
      ? this.api.put(`/admin/perfiles/${id}`, cuerpo)
      : this.api.post('/admin/perfiles', cuerpo);
    accion.subscribe({
      next: () => {
        this.toast.exito(id ? 'Perfil actualizado' : 'Perfil creado', this.form.nombre);
        this.guardando.set(false);
        this.drawerPerfil.set(false);
        this.cargar();
      },
      error: (e: Error) => {
        this.errorForm.set(e.message);
        this.guardando.set(false);
      },
    });
  }

  async eliminar(p: PerfilOrg): Promise<void> {
    const ok = await this.confirm.confirmar({
      titulo: 'Eliminar perfil',
      mensaje: `¿Eliminar el perfil "${p.nombre}"? Sus ${p.usuarios} usuario(s) perderán los tableros asignados por él.`,
      textoConfirmar: 'Eliminar',
      peligro: true,
    });
    if (!ok) return;
    this.api.delete(`/admin/perfiles/${p.id}`).subscribe({
      next: () => {
        this.toast.exito('Perfil eliminado', p.nombre);
        this.cargar();
      },
      error: (e: Error) => this.toast.error('No se pudo eliminar', e.message),
    });
  }

  abrirTableros(p: PerfilOrg): void {
    this.seleccionado.set(p);
    this.tablerosSeleccionados.set([...p.tableroIds]);
    this.tablerosOriginales.set([...p.tableroIds]);
    this.filtroTablero.set('');
    this.errorForm.set(null);
    this.drawerTableros.set(true);
  }

  alternarTablero(tableroId: number): void {
    const actuales = this.tablerosSeleccionados();
    this.tablerosSeleccionados.set(
      actuales.includes(tableroId) ? actuales.filter((id) => id !== tableroId) : [...actuales, tableroId],
    );
  }

  /** Marca o desmarca todos los tableros activos (respeta el filtro de búsqueda si hay uno). */
  marcarTodos(marcar: boolean): void {
    const visibles = this.gruposTableros().flatMap((g) => g.tableros).filter((t) => t.activo).map((t) => t.id);
    this.aplicarMarca(visibles, marcar);
  }

  marcarGrupo(modulo: string, marcar: boolean): void {
    const ids = this.gruposTableros().find((g) => g.modulo === modulo)?.tableros.filter((t) => t.activo).map((t) => t.id) ?? [];
    this.aplicarMarca(ids, marcar);
  }

  /** Precarga el borrador con los tableros de otro perfil (solo los activos); se guarda igual que cualquier cambio. */
  copiarDePerfil(id: string | number): void {
    const origen = this.perfiles().find((p) => p.id === Number(id));
    if (!origen) return;
    const activos = new Set(this.tablerosActivos().map((t) => t.id));
    this.tablerosSeleccionados.set(origen.tableroIds.filter((t) => activos.has(t)));
  }

  private aplicarMarca(ids: number[], marcar: boolean): void {
    const actuales = new Set(this.tablerosSeleccionados());
    for (const id of ids) {
      if (marcar) actuales.add(id);
      else actuales.delete(id);
    }
    this.tablerosSeleccionados.set([...actuales]);
  }

  guardarTableros(): void {
    const perfil = this.seleccionado();
    if (!perfil) return;
    this.guardando.set(true);
    this.api
      .put(`/admin/perfiles/${perfil.id}/tableros`, { tableroIds: this.tablerosSeleccionados() })
      .subscribe({
        next: () => {
          this.toast.exito('Tableros asignados', `${perfil.nombre}: ${this.tablerosSeleccionados().length} visibles. Los usuarios del perfil los ven al recargar.`);
          this.guardando.set(false);
          this.drawerTableros.set(false);
          this.cargar();
        },
        error: (e: Error) => {
          this.errorForm.set(e.message);
          this.guardando.set(false);
        },
      });
  }

  abrirAlcances(p: PerfilOrg): void {
    this.seleccionado.set(p);
    this.alcancesEdicion.set(p.alcances.map((a) => ({ ...a })));
    const empresas = p.alcances.filter((a) => a.recursoTipo === 'empresa').map((a) => a.recursoClave);
    this.empresasTodas.set(empresas.includes('*'));
    this.empresasSel.set(new Set(empresas.filter((c) => c !== '*')));
    const todo = p.alcances.some((a) => (a.recursoTipo === 'metrica' || a.recursoTipo === 'dominio') && a.recursoClave === '*');
    this.catalogoTodo.set(todo);
    this.dominiosSel.set(new Set(p.alcances.filter((a) => a.recursoTipo === 'dominio' && a.recursoClave !== '*').map((a) => a.recursoClave)));
    this.metricasSel.set(new Set(p.alcances.filter((a) => a.recursoTipo === 'metrica' && a.recursoClave !== '*').map((a) => a.recursoClave)));
    this.alcancesOriginales.set(this.alcancesActuales().map((x) => `${x.recursoTipo}:${x.recursoClave}`));
    this.errorForm.set(null);
    this.drawerAlcances.set(true);
    if (!this.catalogo()) {
      this.api.get<CatalogoAlcances>('/admin/catalogo-alcances').subscribe({
        next: (c) => this.catalogo.set(c),
        error: (e: Error) => this.errorForm.set(`No se pudo cargar el catálogo: ${e.message}`),
      });
    }
  }

  nombreDominio(clave: string): string {
    const nombres: Record<string, string> = {
      ventas: 'Ventas', tesoreria: 'Tesorería', compras: 'Compras', inventario: 'Inventario', pedidos: 'Pedidos',
      rentabilidad: 'Rentabilidad', contabilidad: 'Contabilidad', clientes: 'Clientes', otros: 'Otros',
    };
    return nombres[clave] ?? clave.charAt(0).toUpperCase() + clave.slice(1).replace(/_/g, ' ');
  }

  private alternarEn(sig: typeof this.empresasSel, clave: string): void {
    const s = new Set(sig());
    if (s.has(clave)) s.delete(clave);
    else s.add(clave);
    sig.set(s);
  }

  alternarEmpresasTodas(): void { this.empresasTodas.set(!this.empresasTodas()); }
  alternarEmpresa(clave: string): void { this.alternarEn(this.empresasSel, clave); }
  alternarCatalogoTodo(): void { this.catalogoTodo.set(!this.catalogoTodo()); }
  alternarDominio(clave: string): void {
    this.alternarEn(this.dominiosSel, clave);
    // Un dominio completo absorbe sus métricas sueltas: no se guardan dos veces.
    const d = this.catalogo()?.dominios.find((x) => x.clave === clave);
    if (d && this.dominiosSel().has(clave)) {
      const m = new Set(this.metricasSel());
      for (const x of d.metricas) m.delete(x.clave);
      this.metricasSel.set(m);
    }
  }
  alternarMetrica(clave: string): void { this.alternarEn(this.metricasSel, clave); }

  guardarAlcances(): void {
    const perfil = this.seleccionado();
    if (!perfil) return;
    const alcances = this.alcancesActuales();
    this.guardando.set(true);
    this.api.put(`/admin/perfiles/${perfil.id}/alcances`, { alcances }).subscribe({
      next: () => {
        this.toast.exito('Alcances guardados', `${perfil.nombre}: el asistente ya responde con este alcance a sus usuarios.`);
        this.guardando.set(false);
        this.drawerAlcances.set(false);
        this.cargar();
      },
      error: (e: Error) => {
        this.errorForm.set(e.message);
        this.guardando.set(false);
      },
    });
  }
}
