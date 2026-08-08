import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { DrawerComponent } from '../../core/drawer.component';
import { Hecho, Metrica, MetricaDetalle, PendienteVoto, VersionMetrica } from '../../core/modelos';
import { ToastService } from '../../core/toast.service';

interface FormMetrica {
  clave: string;
  nombreOficial: string;
  definicionNegocio: string;
  hechoOrigen: string;
  owner: string;
  aprobadores: string;
  firmasRequeridas: number | null;
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

    @if (pendientes().length) {
      <div class="tarjeta pendientes">
        <div class="card__titulo">
          <span class="eyebrow">Certificación</span>
        </div>
        <h3 style="margin-bottom:10px;">Pendientes de mi voto ({{ pendientes().length }})</h3>
        <div class="pendientes__lista">
          @for (p of pendientes(); track p.versionId) {
            <button type="button" class="pendiente" (click)="votarPendiente(p)">
              <div>
                <strong>{{ p.nombreOficial }}</strong>
                <span style="color:var(--muted); font-size:12.5px;"> · v{{ p.version }}</span>
              </div>
              <code style="font-size:12px; color:var(--muted);">{{ p.formula }}</code>
              <span style="font-size:11.5px; color:var(--faint);">Creado por {{ p.creadoPor ?? 'desconocido' }}</span>
            </button>
          }
        </div>
      </div>
    }

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
                  @if (m.estado === 'certificada') {
                    <button class="secundario pequeno peligro" (click)="deprecar(m)">Deprecar</button>
                  }
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
          <div class="campo">
            <label>Responsable</label>
            <input name="owner" [(ngModel)]="form.owner" required placeholder="Gerencia de ventas" />
          </div>
          <div class="campo">
            <label>Quiénes firman <span style="color:var(--faint);">(correos separados por coma)</span></label>
            <input name="aprob" [(ngModel)]="form.aprobadores"
                   (ngModelChange)="ajustarQuorum()" placeholder="ana@empresa.com, luis@empresa.com" />
          </div>
          @if (cuantosFirmantes() > 1) {
            <div class="campo">
              <label>Firmas necesarias para certificar</label>
              <select name="quorum" [(ngModel)]="form.firmasRequeridas">
                <option [ngValue]="null">Todas ({{ cuantosFirmantes() }}) — unanimidad</option>
                @for (n of opcionesQuorum(); track n) {
                  <option [ngValue]="n">{{ n }} de {{ cuantosFirmantes() }}</option>
                }
              </select>
              <span class="ayuda">
                @if (form.firmasRequeridas === null) {
                  Tendrán que firmar los {{ cuantosFirmantes() }}. Si alguno se ausenta, la métrica
                  no podrá certificarse hasta que vuelva.
                } @else if (form.firmasRequeridas === 1) {
                  Con una sola firma basta: nombras varios por comodidad, pero no hay control de
                  varias personas.
                } @else {
                  Bastan {{ form.firmasRequeridas }} de {{ cuantosFirmantes() }}. Un solo rechazo
                  detiene la certificación aunque otros ya hayan firmado.
                }
              </span>
            </div>
          }
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
    .pendientes { margin-bottom: 20px; border-color: var(--brand-300); background: var(--brand-50); }
    .pendientes__lista { display: flex; flex-direction: column; gap: 8px; }
    .pendiente {
      display: flex; flex-direction: column; gap: 3px; text-align: left; width: 100%;
      background: var(--surface); color: var(--text); border: 1px solid var(--border-2);
      border-radius: var(--r-sm); padding: 10px 13px; font-weight: 400;
    }
    .pendiente:hover { background: var(--surface-2); border-color: var(--brand-500); }
  `],
})
export class MetricasComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly metricas = signal<Metrica[]>([]);
  readonly hechos = signal<Hecho[]>([]);
  readonly pendientes = signal<PendienteVoto[]>([]);
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
    this.cargarPendientes();
  }

  cargarPendientes(): void {
    this.api.get<PendienteVoto[]>('/metricas/pendientes-de-mi-voto').subscribe({
      next: (d) => this.pendientes.set(d),
      error: () => {},
    });
  }

  /** Abre el drawer de certificación de la métrica de un pendiente, para votar ahí mismo. */
  votarPendiente(p: PendienteVoto): void {
    this.api.get<MetricaDetalle>(`/metricas/${p.metricaId}`).subscribe({
      next: (d) => this.detalle.set(d),
      error: (e: Error) => this.toast.error('No se pudo abrir la métrica', e.message),
    });
  }

  /** Cuántos correos hay escritos ahora mismo en el campo de firmantes. */
  cuantosFirmantes(): number {
    return this.form.aprobadores.split(',').map((x) => x.trim()).filter(Boolean).length;
  }

  opcionesQuorum(): number[] {
    return Array.from({ length: this.cuantosFirmantes() }, (_, i) => i + 1);
  }

  /** Un quórum mayor que los firmantes nombrados sería imposible de alcanzar. */
  ajustarQuorum(): void {
    const total = this.cuantosFirmantes();
    if (this.form.firmasRequeridas !== null && this.form.firmasRequeridas > total) {
      this.form.firmasRequeridas = total > 0 ? total : null;
    }
  }

  private vacio(): FormMetrica {
    return { clave: '', nombreOficial: '', definicionNegocio: '', hechoOrigen: '', owner: '', aprobadores: '', firmasRequeridas: null };
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
      firmasRequeridas: m.firmasRequeridas ?? null,
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
      ? { nombreOficial: this.form.nombreOficial, definicionNegocio: this.form.definicionNegocio, owner: this.form.owner, aprobadores, firmasRequeridas: this.form.firmasRequeridas }
      : { clave: this.form.clave, nombreOficial: this.form.nombreOficial, definicionNegocio: this.form.definicionNegocio, hechoOrigen: this.form.hechoOrigen, owner: this.form.owner, aprobadores, firmasRequeridas: this.form.firmasRequeridas };
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
        this.cargarPendientes();
      },
    });
  }

  /** Deprecar es definitivo: el único camino de vuelta es nueva versión + recertificación (§9). */
  deprecar(m: Metrica): void {
    if (!confirm(`¿Deprecar la métrica "${m.nombreOficial}"? Deja de estar disponible para el agente; solo se reactiva certificando una versión nueva.`)) return;
    this.api.post<Metrica>(`/metricas/${m.id}/deprecar`, {}).subscribe({
      next: (d) => {
        this.toast.exito('Métrica deprecada', d.nombreOficial);
        this.cargar();
      },
      error: (e: Error) => this.toast.error('No se pudo deprecar', e.message),
    });
  }
}
