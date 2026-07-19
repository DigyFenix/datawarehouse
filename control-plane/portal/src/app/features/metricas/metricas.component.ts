import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { DrawerComponent } from '../../core/drawer.component';
import { Hecho, Metrica, MetricaDetalle, VersionMetrica } from '../../core/modelos';
import { ToastService } from '../../core/toast.service';

interface FormMetrica {
  clave: string;
  nombreOficial: string;
  definicionNegocio: string;
  hechoOrigen: string;
  owner: string;
  aprobadores: string;
}

@Component({
  selector: 'app-metricas',
  standalone: true,
  imports: [FormsModule, DrawerComponent],
  template: `
    <div class="page-header">
      <div class="titulo-grupo">
        <span class="eyebrow">Capa semántica</span>
        <h2>Catálogo de métricas</h2>
      </div>
      <button (click)="nueva()">+ Nueva métrica</button>
    </div>

    <div class="tarjeta" style="padding:0;">
      <div class="tabla-wrap">
        <table>
          <thead><tr><th>Métrica</th><th>Origen</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            @for (m of metricas(); track m.id) {
              <tr>
                <td>
                  <div><strong>{{ m.nombreOficial }}</strong></div>
                  <code style="font-size:12px; color:var(--muted);">{{ m.clave }}</code>
                </td>
                <td><code>{{ m.hechoOrigen }}</code></td>
                <td><span class="badge badge--{{ m.estado }}">{{ etiqueta(m.estado) }}</span></td>
                <td style="text-align:right; white-space:nowrap;">
                  <button class="secundario pequeno" (click)="editar(m)">Editar</button>
                  <button class="secundario pequeno" (click)="gestionar(m)">Gestionar</button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="4"><div class="vacio"><strong>Sin métricas</strong>Define la primera con “Nueva métrica”.</div></td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <!-- Drawer crear / editar campos base -->
    @if (formAbierto()) {
      <app-drawer [titulo]="edicionId() ? 'Editar métrica' : 'Nueva métrica'"
                  [eyebrow]="edicionId() ? form.clave : 'Capa semántica'" (cerrar)="formAbierto.set(false)">
        <form (ngSubmit)="guardar()">
          <div class="campo"><label>Clave</label><input name="clave" [(ngModel)]="form.clave" required placeholder="ventas_netas" [disabled]="!!edicionId()" /></div>
          <div class="campo"><label>Nombre oficial</label><input name="nombre" [(ngModel)]="form.nombreOficial" required /></div>
          <div class="campo"><label>Definición de negocio</label><textarea name="def" rows="3" [(ngModel)]="form.definicionNegocio" required></textarea></div>
          <div class="campo">
            <label>Hecho de origen</label>
            <select name="hecho" [(ngModel)]="form.hechoOrigen" [disabled]="!!edicionId()">
              @for (h of hechos(); track h.clave) { <option [value]="h.clave">{{ h.clave }}</option> }
            </select>
          </div>
          <div class="campo"><label>Owner</label><input name="owner" [(ngModel)]="form.owner" required placeholder="data_owner_ventas" /></div>
          <div class="campo">
            <label>Aprobadores <span style="color:var(--faint);">(emails, separados por coma)</span></label>
            <input name="aprob" [(ngModel)]="form.aprobadores" placeholder="owner1@…, owner2@…" />
          </div>
          @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
          <div class="acciones-fila">
            <button type="button" class="secundario" (click)="formAbierto.set(false)">Cancelar</button>
            <button type="submit" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar' }}</button>
          </div>
        </form>
      </app-drawer>
    }

    <!-- Drawer ancho: gestión de versiones y certificación -->
    @if (detalle(); as d) {
      <app-drawer [titulo]="d.nombreOficial" [eyebrow]="'Certificación · ' + d.clave" [ancho]="true" (cerrar)="detalle.set(null)">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
          <span class="badge badge--{{ d.estado }}">{{ etiqueta(d.estado) }}</span>
          <span style="font-size:13px; color:var(--muted);">v{{ d.versionDefinicion }} vigente</span>
        </div>
        <p style="font-size:13.5px; color:var(--muted); margin:0 0 6px;">{{ d.definicionNegocio }}</p>
        <p style="font-size:13px; margin:0 0 20px;">
          <span class="eyebrow">Fórmula vigente</span><br>
          @if (d.formula) { <code>{{ d.formula }}</code> } @else { <span style="color:var(--faint);">Sin definir — crea y certifica una versión.</span> }
        </p>

        <h4>Versiones</h4>
        @for (v of d.versiones; track v.id) {
          <div class="version">
            <div class="version__cab">
              <span>v{{ v.version }} · <code>{{ v.formula }}</code></span>
              <span class="badge badge--{{ v.estado }}">{{ etiqueta(v.estado) }}</span>
            </div>
            @if (v.aprobaciones.length) {
              <div class="votos">
                <span class="eyebrow">Aprobadores</span>
                @for (a of v.aprobaciones; track a.id) {
                  <span class="badge"
                    [class.badge--aprobo]="a.aprobado === true"
                    [class.badge--rechazo]="a.aprobado === false"
                    [class.badge--pendiente]="a.aprobado === null">
                    {{ a.aprobador }} · {{ a.aprobado === null ? 'pendiente' : (a.aprobado ? 'aprobó' : 'rechazó') }}
                  </span>
                }
              </div>
            }
            <div class="version__acciones">
              @if (v.estado === 'borrador') {
                <button class="pequeno" (click)="enviarRevision(d.id, v.id)">Enviar a revisión</button>
              }
              @if (v.estado === 'en_revision' && puedeVotar(v)) {
                <button class="pequeno" (click)="votar(v.id, true)">Aprobar</button>
                <button class="pequeno peligro" (click)="votar(v.id, false)">Rechazar</button>
              }
            </div>
          </div>
        }

        <h4 style="margin-top:18px;">Nueva versión</h4>
        <div class="campo"><label>Fórmula</label><input name="f" [(ngModel)]="nuevaVersion.formula" placeholder="ventas_brutas - devoluciones" /></div>
        <div class="campo"><label>Definición</label><input name="dn" [(ngModel)]="nuevaVersion.definicionNegocio" /></div>
        <button class="secundario" (click)="crearVersion(d.id)">Agregar versión</button>
      </app-drawer>
    }
  `,
  styles: [`
    .version { border: 1px solid var(--border); border-radius: var(--r-sm); padding: 13px; margin-bottom: 10px; }
    .version__cab { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 13.5px; }
    .votos { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 10px; }
    .version__acciones { display: flex; gap: 8px; margin-top: 12px; }
    .version__acciones:empty { display: none; }
  `],
})
export class MetricasComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly metricas = signal<Metrica[]>([]);
  readonly hechos = signal<Hecho[]>([]);
  readonly detalle = signal<MetricaDetalle | null>(null);
  readonly formAbierto = signal(false);
  readonly edicionId = signal<number | null>(null);
  readonly errorForm = signal<string | null>(null);
  readonly guardando = signal(false);

  form: FormMetrica = this.vacio();
  nuevaVersion = { formula: '', definicionNegocio: '' };

  private readonly etiquetas: Record<string, string> = {
    borrador: 'Borrador',
    en_revision: 'En revisión',
    certificada: 'Certificada',
    deprecada: 'Deprecada',
    exploratoria: 'Exploratoria',
  };

  ngOnInit(): void {
    this.api.get<Hecho[]>('/hechos').subscribe({
      next: (h) => {
        this.hechos.set(h);
        if (h[0] && !this.form.hechoOrigen) this.form.hechoOrigen = h[0].clave;
      },
    });
    this.cargar();
  }

  private vacio(): FormMetrica {
    return { clave: '', nombreOficial: '', definicionNegocio: '', hechoOrigen: '', owner: '', aprobadores: '' };
  }

  etiqueta(estado: string): string {
    return this.etiquetas[estado] ?? estado;
  }

  cargar(): void {
    this.api.get<Metrica[]>('/metricas').subscribe({
      next: (d) => this.metricas.set(d),
      error: (e: Error) => this.toast.error('No se pudieron cargar las métricas', e.message),
    });
  }

  nueva(): void {
    this.form = this.vacio();
    this.form.hechoOrigen = this.hechos()[0]?.clave ?? '';
    this.edicionId.set(null);
    this.errorForm.set(null);
    this.formAbierto.set(true);
  }

  editar(m: Metrica): void {
    this.form = {
      clave: m.clave,
      nombreOficial: m.nombreOficial,
      definicionNegocio: m.definicionNegocio,
      hechoOrigen: m.hechoOrigen,
      owner: m.owner,
      aprobadores: (m.aprobadores ?? []).join(', '),
    };
    this.edicionId.set(m.id);
    this.errorForm.set(null);
    this.formAbierto.set(true);
  }

  gestionar(m: Metrica): void {
    this.api.get<MetricaDetalle>(`/metricas/${m.id}`).subscribe({
      next: (d) => this.detalle.set(d),
      error: (e: Error) => this.toast.error('No se pudo abrir la métrica', e.message),
    });
  }

  puedeVotar(v: VersionMetrica): boolean {
    return v.aprobaciones.some((a) => a.aprobado === null);
  }

  guardar(): void {
    this.errorForm.set(null);
    this.guardando.set(true);
    const id = this.edicionId();
    const aprobadores = this.form.aprobadores.split(',').map((s) => s.trim()).filter(Boolean);
    const cuerpo = id
      ? { nombreOficial: this.form.nombreOficial, definicionNegocio: this.form.definicionNegocio, owner: this.form.owner, aprobadores }
      : { clave: this.form.clave, nombreOficial: this.form.nombreOficial, definicionNegocio: this.form.definicionNegocio, hechoOrigen: this.form.hechoOrigen, owner: this.form.owner, aprobadores };
    const accion = id
      ? this.api.put<Metrica>(`/metricas/${id}`, cuerpo)
      : this.api.post<Metrica>('/metricas', cuerpo);
    accion.subscribe({
      next: (m) => {
        this.toast.exito(id ? 'Métrica actualizada' : 'Métrica creada', m.nombreOficial);
        this.guardando.set(false);
        this.formAbierto.set(false);
        this.cargar();
      },
      error: (e: Error) => {
        this.errorForm.set(e.message);
        this.guardando.set(false);
      },
    });
  }

  crearVersion(metricaId: number): void {
    if (!this.nuevaVersion.formula || !this.nuevaVersion.definicionNegocio) {
      this.toast.error('Faltan datos', 'Completa fórmula y definición.');
      return;
    }
    this.api.post(`/metricas/${metricaId}/versiones`, this.nuevaVersion).subscribe({
      next: () => {
        this.toast.exito('Versión creada');
        this.nuevaVersion = { formula: '', definicionNegocio: '' };
        this.refrescar(metricaId);
      },
      error: (e: Error) => this.toast.error('No se pudo crear la versión', e.message),
    });
  }

  enviarRevision(metricaId: number, versionId: number): void {
    this.api.post(`/metricas/${metricaId}/versiones/${versionId}/enviar-revision`, {}).subscribe({
      next: () => {
        this.toast.info('Enviada a revisión', 'Esperando el voto de los aprobadores.');
        this.refrescar(metricaId);
      },
      error: (e: Error) => this.toast.error('No se pudo enviar a revisión', e.message),
    });
  }

  votar(versionId: number, aprobado: boolean): void {
    const metricaId = this.detalle()?.id;
    this.api.post<{ resultado: string }>(`/metricas/versiones/${versionId}/votar`, { aprobado }).subscribe({
      next: (r) => {
        if (r.resultado === 'certificada') this.toast.exito('Métrica certificada', 'Todos los aprobadores aprobaron.');
        else if (r.resultado === 'rechazada') this.toast.info('Versión devuelta a borrador', 'Un aprobador la rechazó.');
        else this.toast.exito('Voto registrado', 'Falta que aprueben los demás.');
        if (metricaId) this.refrescar(metricaId);
      },
      error: (e: Error) => this.toast.error('No se pudo registrar el voto', e.message),
    });
  }

  private refrescar(metricaId: number): void {
    this.api.get<MetricaDetalle>(`/metricas/${metricaId}`).subscribe({
      next: (d) => {
        this.detalle.set(d);
        this.cargar();
      },
    });
  }
}
