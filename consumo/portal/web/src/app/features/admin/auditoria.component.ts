import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';

import { ApiService } from '../../core/api.service';
import { EntradaAuditoria } from '../../core/modelos';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';
import { EmptyComponent } from '../../ui/empty.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { SkeletonComponent } from '../../ui/skeleton.component';
import { PestanaTab, TabsComponent } from '../../ui/tabs.component';

const PESTANAS: PestanaTab[] = [
  { etiqueta: 'Usuarios', segmento: 'usuarios' },
  { etiqueta: 'Perfiles', segmento: 'perfiles' },
  { etiqueta: 'Auditoría', segmento: 'auditoria' },
];

/** Auditoría de la organización: logins, cambios y aperturas de tableros. */
@Component({
  selector: 'app-admin-auditoria',
  standalone: true,
  imports: [DatePipe, TabsComponent, PageHeaderComponent, SkeletonComponent, EmptyComponent],
  template: `
    <app-page-header eyebrow="Administración" titulo="Auditoría"></app-page-header>
    <app-tabs [baseRuta]="['/', tenant.hash(), 'admin']" [items]="pestanas"></app-tabs>

    <div class="tarjeta tarjeta--tabla">
      <div class="tabla-wrap tabla-responsive">
        <table>
          <thead><tr><th scope="col">Fecha</th><th scope="col">Usuario</th><th scope="col">Acción</th><th scope="col">Entidad</th><th scope="col">Detalle</th></tr></thead>
          <tbody>
            @if (cargando()) {
              <app-skeleton variante="fila-tabla" [columnas]="5"></app-skeleton>
              <app-skeleton variante="fila-tabla" [columnas]="5"></app-skeleton>
              <app-skeleton variante="fila-tabla" [columnas]="5"></app-skeleton>
              <app-skeleton variante="fila-tabla" [columnas]="5"></app-skeleton>
            } @else {
              @for (e of entradas(); track e.id) {
                <tr>
                  <td data-label="Fecha" class="mono">{{ e.ocurridoEn | date: 'dd/MM/yyyy HH:mm:ss' }}</td>
                  <td data-label="Usuario">{{ e.usuarioEmail ?? '—' }}</td>
                  <td data-label="Acción"><span class="chip">{{ e.accion }}</span></td>
                  <td data-label="Entidad"><code>{{ e.entidad }}</code>@if (e.entidadId) { <span class="sutil">#{{ e.entidadId }}</span> }</td>
                  <td data-label="Detalle" class="detalle">
                    @if (e.despues) {
                      <details>
                        <summary>{{ resumen(e.despues) }}</summary>
                        <pre class="json">{{ formatear(e.despues) }}</pre>
                      </details>
                    } @else {
                      <span class="sutil">—</span>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="5"><app-empty titulo="Sin actividad registrada"></app-empty></td></tr>
              }
            }
          </tbody>
        </table>
      </div>
      @if (puedeCargarMas()) {
        <div class="pie"><button class="secundario pequeno" (click)="cargarMas()" [disabled]="cargandoMas()">
          @if (cargandoMas()) { <span class="spinner"></span> }
          {{ cargandoMas() ? 'Cargando…' : 'Cargar más' }}
        </button></div>
      }
    </div>
  `,
  styles: [`
    .sutil { font-size: var(--fs-xs); color: var(--faint); }
    .mono { font-family: var(--mono); font-size: 12px; white-space: nowrap; }
    .chip { display: inline-block; background: var(--brand-100); color: var(--brand-700); border-radius: 999px; padding: 2px 9px; font-size: var(--fs-xs); }
    .detalle summary { cursor: pointer; font-size: 11px; color: var(--muted); font-family: var(--mono); }
    .detalle summary:hover { color: var(--text); }
    .detalle .json {
      margin: 8px 0 0; padding: 10px 12px; background: var(--surface-2); border: 1px solid var(--border);
      border-radius: var(--r-sm); font-size: 11.5px; white-space: pre-wrap; word-break: break-word;
      max-width: 480px; color: var(--text);
    }
    .pie { padding: 12px; text-align: center; border-top: 1px solid var(--border); }
  `],
})
export class AuditoriaComponent {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  readonly tenant = inject(TenantService);

  readonly pestanas = PESTANAS;
  readonly entradas = signal<EntradaAuditoria[]>([]);
  readonly puedeCargarMas = signal(false);
  readonly cargando = signal(true);
  readonly cargandoMas = signal(false);
  private readonly limite = 100;

  constructor() {
    this.cargar();
  }

  private cargar(desdeId?: number): void {
    if (desdeId) this.cargandoMas.set(true);
    else this.cargando.set(true);
    const sufijo = desdeId ? `&desdeId=${desdeId}` : '';
    this.api.get<EntradaAuditoria[]>(`/admin/auditoria?limite=${this.limite}${sufijo}`).subscribe({
      next: (d) => {
        this.entradas.set(desdeId ? [...this.entradas(), ...d] : d);
        this.puedeCargarMas.set(d.length === this.limite);
        this.cargando.set(false);
        this.cargandoMas.set(false);
      },
      error: (e: Error) => {
        this.toast.error('No se pudo cargar la auditoría', e.message);
        this.cargando.set(false);
        this.cargandoMas.set(false);
      },
    });
  }

  cargarMas(): void {
    const ultima = this.entradas().at(-1);
    if (ultima) this.cargar(ultima.id);
  }

  resumen(objeto: Record<string, unknown>): string {
    const texto = JSON.stringify(objeto);
    return texto.length > 90 ? `${texto.slice(0, 90)}… (ver JSON)` : `${texto} (ver JSON)`;
  }

  formatear(objeto: Record<string, unknown>): string {
    return JSON.stringify(objeto, null, 2);
  }
}
