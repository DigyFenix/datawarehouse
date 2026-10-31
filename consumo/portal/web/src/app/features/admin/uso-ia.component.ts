import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';
import { EmptyComponent } from '../../ui/empty.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { SkeletonComponent } from '../../ui/skeleton.component';
import { TabsComponent } from '../../ui/tabs.component';
import { PESTANAS_ADMIN } from './pestanas';

interface UsoPorUsuario {
  usuarioId: number;
  nombre: string;
  email: string;
  activo: boolean;
  perfiles: string[];
  turnos: number;
  tokensEntrada: number;
  tokensSalida: number;
  costoUsd: number;
  ultimoUso: string | null;
}

interface ResumenUsoIa {
  mes: string;
  costoMesUsd: number;
  turnosMes: number;
  costoAcumuladoUsd: number;
  porUsuario: UsoPorUsuario[];
  porPerfil: { perfilId: number; nombre: string; usuarios: number; costoUsd: number }[];
  porDia: { dia: string; costoUsd: number; turnos: number }[];
  tarifas: Record<string, { entrada: number; salida: number }>;
}

/**
 * Uso y costo del asistente, solo para el administrador de la organización: cuánto gasta
 * cada usuario y cada perfil en el mes, el acumulado histórico y la tarifa con la que se
 * calcula. Sirve para decidir cuándo recargar el saldo de Anthropic. Los usuarios no lo ven.
 */
@Component({
  selector: 'app-admin-uso-ia',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, TabsComponent, PageHeaderComponent, SkeletonComponent, EmptyComponent],
  template: `
    <app-page-header eyebrow="Administración" titulo="Uso de IA">
      <label acciones class="mes">
        <span>Mes</span>
        <input type="month" [ngModel]="mes()" (ngModelChange)="cambiarMes($event)" name="mes" [max]="mesActual" />
      </label>
    </app-page-header>
    <app-tabs [baseRuta]="['/', tenant.hash(), 'admin']" [items]="pestanas"></app-tabs>

    <p class="intro">
      Lo que el asistente consumió de la API de Anthropic, por usuario y por perfil. Es un costo
      <strong>estimado</strong> con la tarifa configurada en el servidor; el cargo real lo factura Anthropic
      a la cuenta de la organización. Los usuarios no ven esta pantalla.
    </p>

    @if (cargando()) {
      <div class="kpis"><app-skeleton variante="tarjeta" [alto]="84" /><app-skeleton variante="tarjeta" [alto]="84" /><app-skeleton variante="tarjeta" [alto]="84" /></div>
    }
    @if (!cargando() && resumen(); as r) {
      <div class="kpis">
        <div class="tarjeta kpi">
          <span class="kpi__rotulo">Costo del mes</span>
          <strong class="kpi__valor">{{ r.costoMesUsd | number: '1.2-2' }} <small>USD</small></strong>
          <span class="sutil">{{ r.turnosMes }} {{ r.turnosMes === 1 ? 'consulta' : 'consultas' }} · {{ mesLegible() }}</span>
        </div>
        <div class="tarjeta kpi">
          <span class="kpi__rotulo">Acumulado histórico</span>
          <strong class="kpi__valor">{{ r.costoAcumuladoUsd | number: '1.2-2' }} <small>USD</small></strong>
          <span class="sutil">Desde que se activó el asistente</span>
        </div>
        <div class="tarjeta kpi">
          <span class="kpi__rotulo">Promedio por consulta</span>
          <strong class="kpi__valor">{{ (r.turnosMes ? r.costoMesUsd / r.turnosMes : 0) | number: '1.4-4' }} <small>USD</small></strong>
          <span class="sutil">{{ r.porUsuario.length }} {{ r.porUsuario.length === 1 ? 'usuario activo' : 'usuarios activos' }} en el mes</span>
        </div>
      </div>

      @if (r.porDia.length > 1) {
        <div class="tarjeta barras" aria-label="Costo por día">
          <h4>Costo por día</h4>
          <div class="barras__lista">
            @for (d of r.porDia; track d.dia) {
              <div class="barra" [title]="d.dia + ': ' + (d.costoUsd | number: '1.4-4') + ' USD · ' + d.turnos + ' consultas'">
                <div class="barra__relleno" [style.height.%]="alturaBarra(d.costoUsd)"></div>
                <span class="barra__dia">{{ d.dia.slice(8) }}</span>
              </div>
            }
          </div>
        </div>
      }

      <div class="dos">
        <div class="tarjeta tarjeta--tabla">
          <div class="tabla-cab"><h4>Por usuario</h4><span class="sutil">ordenado por costo</span></div>
          <div class="tabla-wrap tabla-responsive">
            <table>
              <thead><tr><th scope="col">Usuario</th><th scope="col">Perfiles</th><th scope="col" class="num">Consultas</th><th scope="col" class="num">Tokens</th><th scope="col" class="num">Costo USD</th><th scope="col">Último uso</th></tr></thead>
              <tbody>
                @for (u of r.porUsuario; track u.usuarioId) {
                  <tr>
                    <td data-label="Usuario"><strong>{{ u.nombre }}</strong><br /><span class="sutil">{{ u.email }}</span>@if (!u.activo) { <span class="chip chip--off">inactivo</span> }</td>
                    <td data-label="Perfiles">@for (p of u.perfiles; track p) { <span class="chip">{{ p }}</span> } @if (!u.perfiles.length) { <span class="sutil">—</span> }</td>
                    <td data-label="Consultas" class="num">{{ u.turnos }}</td>
                    <td data-label="Tokens" class="num" [title]="'entrada ' + u.tokensEntrada + ' · salida ' + u.tokensSalida">{{ u.tokensEntrada + u.tokensSalida | number }}</td>
                    <td data-label="Costo USD" class="num"><strong>{{ u.costoUsd | number: '1.4-4' }}</strong><br /><span class="sutil">{{ porcentaje(u.costoUsd, r.costoMesUsd) }} %</span></td>
                    <td data-label="Último uso">{{ u.ultimoUso ? (u.ultimoUso | date: 'dd/MM HH:mm') : '—' }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="6"><app-empty titulo="Sin consumo en este mes">Nadie usó el asistente en {{ mesLegible() }}. @if (!tenant.moduloAsistente()) { El módulo Asistente no está activo para esta organización. }</app-empty></td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="tarjeta tarjeta--tabla">
          <div class="tabla-cab"><h4>Por perfil</h4><span class="sutil">un usuario con varios perfiles suma en cada uno</span></div>
          <div class="tabla-wrap">
            <table>
              <thead><tr><th scope="col">Perfil</th><th scope="col" class="num">Usuarios</th><th scope="col" class="num">Costo USD</th></tr></thead>
              <tbody>
                @for (p of r.porPerfil; track p.perfilId) {
                  <tr><td>{{ p.nombre }}</td><td class="num">{{ p.usuarios }}</td><td class="num"><strong>{{ p.costoUsd | number: '1.4-4' }}</strong></td></tr>
                } @empty {
                  <tr><td colspan="3"><span class="sutil">Sin consumo por perfil en este mes.</span></td></tr>
                }
              </tbody>
            </table>
          </div>
          <details class="tarifa">
            <summary>Tarifa usada para el cálculo</summary>
            <ul>
              @for (t of tarifas(); track t.modelo) { <li><code>{{ t.modelo }}</code> entrada {{ t.entrada }} · salida {{ t.salida }} USD por millón de tokens</li> }
            </ul>
            <p class="sutil">Se cambia en el servidor con <code>AGENTE_PRECIOS_USD</code>.</p>
          </details>
        </div>
      </div>
    }
  `,
  styles: [`
    .mes { display: flex; align-items: center; gap: 8px; font-size: var(--fs-sm); color: var(--muted); }
    .mes input { width: auto; min-width: 150px; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--sp-3); margin-bottom: var(--sp-4); }
    .kpi { display: flex; flex-direction: column; gap: 4px; padding: var(--sp-4); }
    .kpi__rotulo { font-size: var(--fs-sm); color: var(--muted); font-weight: 500; }
    .kpi__valor { font-size: 24px; font-weight: 600; line-height: 1.1; font-variant-numeric: tabular-nums; }
    .kpi__valor small { font-size: var(--fs-sm); color: var(--muted); font-weight: 500; }
    .barras { margin-bottom: var(--sp-4); padding: var(--sp-4); }
    .barras h4 { margin-bottom: 10px; }
    .barras__lista { display: flex; align-items: flex-end; gap: 4px; height: 90px; }
    .barra { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; height: 100%; gap: 4px; min-width: 0; }
    .barra__relleno { width: 100%; background: var(--brand-400); border-radius: 4px 4px 0 0; min-height: 2px; }
    .barra__dia { font-size: 10px; color: var(--faint); }
    .dos { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: var(--sp-4); align-items: start; }
    @media (max-width: 900px) { .dos { grid-template-columns: 1fr; } }
    .tabla-cab { display: flex; justify-content: space-between; align-items: baseline; padding: 14px 16px 6px; }
    .tabla-cab h4 { margin: 0; color: var(--text); }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .chip { display: inline-block; background: var(--brand-100); color: var(--brand-700); border-radius: 999px; padding: 2px 9px; font-size: var(--fs-xs); margin: 1px 3px 1px 0; }
    .chip--off { background: var(--surface-2); color: var(--faint); margin-left: 6px; }
    .tarifa { padding: 10px 16px 14px; border-top: 1px solid var(--border); font-size: var(--fs-sm); }
    .tarifa summary { cursor: pointer; color: var(--muted); font-weight: 500; }
    .tarifa ul { margin: 8px 0; padding-left: 18px; color: var(--muted); }
    .sutil { color: var(--muted); font-size: var(--fs-xs); }
  `],
})
export class UsoIaComponent {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  readonly tenant = inject(TenantService);

  readonly pestanas = PESTANAS_ADMIN;
  readonly mesActual = new Date().toISOString().slice(0, 7);
  readonly mes = signal(this.mesActual);
  readonly resumen = signal<ResumenUsoIa | null>(null);
  readonly cargando = signal(true);
  readonly tarifas = computed(() =>
    Object.entries(this.resumen()?.tarifas ?? {}).map(([modelo, t]) => ({ modelo, entrada: t.entrada, salida: t.salida })),
  );
  readonly mesLegible = computed(() => {
    const [a, m] = this.mes().split('-').map(Number);
    return new Date(a, m - 1, 1).toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });
  });
  private readonly maxDia = computed(() => Math.max(0, ...(this.resumen()?.porDia ?? []).map((d) => d.costoUsd)));

  constructor() {
    this.cargar();
  }

  cambiarMes(valor: string): void {
    if (!valor) return;
    this.mes.set(valor);
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.api.get<ResumenUsoIa>(`/admin/uso-ia?mes=${this.mes()}`).subscribe({
      next: (r) => {
        this.resumen.set(r);
        this.cargando.set(false);
      },
      error: (e: Error) => {
        this.toast.error('No se pudo leer el uso de IA', e.message);
        this.cargando.set(false);
      },
    });
  }

  alturaBarra(costo: number): number {
    const max = this.maxDia();
    return max > 0 ? Math.max(2, (costo / max) * 100) : 2;
  }

  porcentaje(parte: number, total: number): string {
    return total > 0 ? ((parte / total) * 100).toFixed(1) : '0.0';
  }
}
