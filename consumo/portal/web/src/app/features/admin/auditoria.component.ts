import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { EntradaAuditoria } from '../../core/modelos';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';

/** Auditoría de la organización: logins, cambios y aperturas de tableros. */
@Component({
  selector: 'app-admin-auditoria',
  standalone: true,
  imports: [DatePipe, RouterLink],
  template: `
    <div class="page-header">
      <div class="titulo-grupo">
        <span class="eyebrow">Administración</span>
        <h2>Auditoría</h2>
      </div>
    </div>
    <nav class="tabs">
      <a [routerLink]="['/', tenant.hash(), 'admin', 'usuarios']" class="tab">Usuarios</a>
      <a [routerLink]="['/', tenant.hash(), 'admin', 'perfiles']" class="tab">Perfiles</a>
      <a [routerLink]="['/', tenant.hash(), 'admin', 'auditoria']" class="tab activo">Auditoría</a>
    </nav>

    <div class="tarjeta" style="padding:0;">
      <div class="tabla-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>Detalle</th></tr></thead>
          <tbody>
            @for (e of entradas(); track e.id) {
              <tr>
                <td class="mono">{{ e.ocurridoEn | date: 'dd/MM/yyyy HH:mm:ss' }}</td>
                <td>{{ e.usuarioEmail ?? '—' }}</td>
                <td><span class="chip">{{ e.accion }}</span></td>
                <td><code>{{ e.entidad }}</code>@if (e.entidadId) { <span class="sutil">#{{ e.entidadId }}</span> }</td>
                <td class="detalle">
                  @if (e.despues) { <code>{{ resumen(e.despues) }}</code> } @else { <span class="sutil">—</span> }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="5"><div class="vacio"><strong>Sin actividad registrada</strong></div></td></tr>
            }
          </tbody>
        </table>
      </div>
      @if (puedeCargarMas()) {
        <div class="pie"><button class="secundario pequeno" (click)="cargarMas()">Cargar más</button></div>
      }
    </div>
  `,
  styles: [`
    .sutil { font-size: 11.5px; color: var(--faint); }
    .mono { font-family: var(--mono); font-size: 12px; white-space: nowrap; }
    .chip { display: inline-block; background: var(--brand-100); color: var(--brand-700); border-radius: 999px; padding: 2px 9px; font-size: 11.5px; }
    .detalle code { font-size: 11px; word-break: break-all; }
    .pie { padding: 12px; text-align: center; border-top: 1px solid var(--border); }
    .tabs { display: flex; gap: 4px; margin: 0 0 16px; border-bottom: 1px solid var(--border); }
    .tab { padding: 8px 14px; text-decoration: none; color: var(--muted); font-size: 13.5px; border-bottom: 2px solid transparent; }
    .tab.activo { color: var(--text); border-bottom-color: var(--brand-600); font-weight: 600; }
  `],
})
export class AuditoriaComponent {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  readonly tenant = inject(TenantService);

  readonly entradas = signal<EntradaAuditoria[]>([]);
  readonly puedeCargarMas = signal(false);
  private readonly limite = 100;

  constructor() {
    this.cargar();
  }

  private cargar(desdeId?: number): void {
    const sufijo = desdeId ? `&desdeId=${desdeId}` : '';
    this.api.get<EntradaAuditoria[]>(`/admin/auditoria?limite=${this.limite}${sufijo}`).subscribe({
      next: (d) => {
        this.entradas.set(desdeId ? [...this.entradas(), ...d] : d);
        this.puedeCargarMas.set(d.length === this.limite);
      },
      error: (e: Error) => this.toast.error('No se pudo cargar la auditoría', e.message),
    });
  }

  cargarMas(): void {
    const ultima = this.entradas().at(-1);
    if (ultima) this.cargar(ultima.id);
  }

  resumen(objeto: Record<string, unknown>): string {
    const texto = JSON.stringify(objeto);
    return texto.length > 120 ? `${texto.slice(0, 120)}…` : texto;
  }
}
