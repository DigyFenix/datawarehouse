import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { nombreDominio } from '../../core/dominios';
import { Autorizacion, Hecho, Metrica, Rol } from '../../core/modelos';
import { ToastService } from '../../core/toast.service';

/**
 * Autorizaciones por rol: el control de AUTORIZACIÓN de la gobernanza (§12), que
 * es independiente del RLS. El rol dice qué puede invocar una persona; el RLS, qué
 * filas ve. Sin esta pantalla el API existía pero no había forma de administrarlo.
 *
 * El comodín `*` autoriza el tipo completo (todos los dominios o todas las
 * métricas), y se marca aparte porque es la decisión con más alcance de la pantalla.
 */
@Component({
  selector: 'app-autorizaciones',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page-header">
      <div class="titulo-grupo">
        <span class="eyebrow">Acceso</span>
        <h2>Autorizaciones por rol</h2>
      </div>
    </div>

    <p class="intro">
      Aquí se define <strong>qué puede consultar cada rol</strong>. Es distinto de lo que ve:
      el rol autoriza la métrica o el dominio; las filas que devuelve dependen del alcance
      de cada usuario en el portal de su organización.
    </p>

    <div class="disposicion">
      <aside class="tarjeta lista-roles">
        @for (r of roles(); track r.id) {
          <button
            class="fila-rol"
            [class.fila-rol--activa]="r.id === rolActivoId()"
            (click)="elegirRol(r.id)"
          >
            <span class="fila-rol__nombre">{{ r.nombre }}</span>
            <span class="fila-rol__desc">{{ r.descripcion ?? 'Sin descripción' }}</span>
            <span class="fila-rol__cuenta">{{ conteo()[r.id] ?? 0 }}</span>
          </button>
        } @empty {
          <div class="vacio"><strong>Sin roles</strong>El catálogo de roles está vacío.</div>
        }
      </aside>

      <section class="tarjeta panel">
        @if (rolActivo(); as rol) {
          <header class="panel__cabecera">
            <div>
              <h3>{{ rol.nombre }}</h3>
              <p>{{ rol.descripcion ?? 'Sin descripción' }}</p>
            </div>
          </header>

          @if (cargando()) {
            <p class="estado">Cargando autorizaciones…</p>
          } @else {
            <div class="tabla-wrap">
              <table>
                <thead>
                  <tr><th>Tipo</th><th>Recurso</th><th>Permiso</th><th></th></tr>
                </thead>
                <tbody>
                  @for (a of autorizaciones(); track a.id) {
                    <tr>
                      <td>{{ etiquetaTipo(a.recursoTipo) }}</td>
                      <td>
                        @if (a.recursoClave === '*') {
                          <span class="badge badge--global">Todos</span>
                        } @else {
                          {{ nombreRecurso(a.recursoTipo, a.recursoClave) }}
                        }
                      </td>
                      <td><span class="badge badge--pill">{{ etiquetaPermiso(a.permiso) }}</span></td>
                      <td style="text-align:right;">
                        <button class="secundario pequeno" (click)="quitar(a)">Quitar</button>
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="4">
                        <div class="vacio">
                          <strong>Este rol no tiene ninguna autorización</strong>
                          Quien lo tenga no podrá consultar ninguna métrica.
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <form class="alta" (ngSubmit)="agregar()">
              <div class="campo">
                <label for="tipo">Tipo</label>
                <select id="tipo" name="tipo" [(ngModel)]="nueva.recursoTipo" (ngModelChange)="alCambiarTipo()">
                  <option value="dominio">Dominio</option>
                  <option value="metrica">Métrica</option>
                  <option value="portal">Portal</option>
                </select>
              </div>

              <div class="campo">
                <label for="recurso">Recurso</label>
                <select id="recurso" name="recurso" [(ngModel)]="nueva.recursoClave">
                  <option value="*">Todos</option>
                  @for (o of opcionesRecurso(); track o.clave) {
                    <option [value]="o.clave">{{ o.nombre }}</option>
                  }
                </select>
              </div>

              <div class="campo">
                <label for="permiso">Permiso</label>
                <select id="permiso" name="permiso" [(ngModel)]="nueva.permiso">
                  <option value="leer">Leer — ver la definición</option>
                  <option value="invocar">Invocar — consultar el dato</option>
                  <option value="certificar">Certificar — aprobar versiones</option>
                  <option value="administrar">Administrar — crear y editar</option>
                </select>
              </div>

              <button type="submit" [disabled]="guardando()">
                {{ guardando() ? 'Agregando…' : 'Agregar' }}
              </button>
            </form>

            @if (nueva.recursoClave === '*') {
              <p class="aviso">
                Con <strong>Todos</strong>, este rol queda autorizado sobre
                {{ nueva.recursoTipo === 'metrica' ? 'todas las métricas' : 'todos los dominios' }},
                incluidos los que se creen después.
              </p>
            }
          }
        } @else {
          <div class="vacio"><strong>Elige un rol</strong>Selecciónalo en la lista de la izquierda.</div>
        }
      </section>
    </div>
  `,
  styles: [
    `
      .intro {
        margin: 0 0 18px;
        max-width: 70ch;
        font-size: 13.5px;
        line-height: 1.6;
        color: var(--faint);
      }
      .intro strong {
        color: var(--texto);
      }
      .disposicion {
        display: grid;
        grid-template-columns: minmax(220px, 300px) 1fr;
        gap: 16px;
        align-items: start;
      }
      @media (max-width: 900px) {
        .disposicion {
          grid-template-columns: 1fr;
        }
      }
      .lista-roles {
        padding: 6px;
      }
      .fila-rol {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 2px 10px;
        width: 100%;
        padding: 10px 12px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        text-align: left;
        cursor: pointer;
        color: inherit;
        font: inherit;
      }
      .fila-rol:hover {
        background: var(--surface-2);
      }
      .fila-rol--activa {
        background: var(--surface-2);
        box-shadow: inset 2px 0 0 var(--marca);
      }
      .fila-rol__nombre {
        font-weight: 600;
        font-size: 13.5px;
      }
      .fila-rol__desc {
        grid-column: 1;
        font-size: 12px;
        line-height: 1.45;
        color: var(--faint);
      }
      .fila-rol__cuenta {
        grid-row: 1 / span 2;
        align-self: center;
        min-width: 26px;
        padding: 2px 8px;
        border-radius: 999px;
        background: var(--surface-3, var(--surface-2));
        font-size: 12px;
        text-align: center;
        color: var(--faint);
      }
      .panel {
        padding: 0;
      }
      .panel__cabecera {
        padding: 16px 18px;
        border-bottom: 1px solid var(--borde);
      }
      .panel__cabecera h3 {
        margin: 0 0 3px;
        font-size: 15px;
      }
      .panel__cabecera p {
        margin: 0;
        font-size: 12.5px;
        color: var(--faint);
      }
      .estado {
        padding: 20px 18px;
        font-size: 13px;
        color: var(--faint);
      }
      .alta {
        display: flex;
        gap: 10px;
        align-items: flex-end;
        flex-wrap: wrap;
        padding: 14px 18px;
        border-top: 1px solid var(--borde);
      }
      .alta .campo {
        flex: 1 1 160px;
        margin: 0;
      }
      .aviso {
        margin: 0;
        padding: 0 18px 16px;
        font-size: 12.5px;
        line-height: 1.5;
        color: var(--faint);
      }
      .aviso strong {
        color: var(--texto);
      }
    `,
  ],
})
export class AutorizacionesComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly roles = signal<Rol[]>([]);
  readonly metricas = signal<Metrica[]>([]);
  readonly hechos = signal<Hecho[]>([]);
  readonly autorizaciones = signal<Autorizacion[]>([]);
  readonly conteo = signal<Record<number, number>>({});
  readonly rolActivoId = signal<number | null>(null);
  readonly cargando = signal(false);
  readonly guardando = signal(false);

  nueva: { recursoTipo: 'dominio' | 'metrica' | 'portal'; recursoClave: string; permiso: string } = {
    recursoTipo: 'dominio',
    recursoClave: '*',
    permiso: 'invocar',
  };

  readonly rolActivo = computed(() => this.roles().find((r) => r.id === this.rolActivoId()) ?? null);

  /** Dominios reales del catálogo de hechos: nunca una lista fija en el código. */
  readonly dominios = computed(() =>
    [...new Set(this.hechos().map((h) => h.dominio))].filter(Boolean).sort(),
  );

  readonly opcionesRecurso = computed(() => {
    if (this.nueva.recursoTipo === 'metrica') {
      return this.metricas()
        .map((m) => ({ clave: m.clave, nombre: m.nombreOficial }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    }
    if (this.nueva.recursoTipo === 'dominio') {
      return this.dominios().map((d) => ({ clave: d, nombre: nombreDominio(d) }));
    }
    return [
      { clave: 'admin', nombre: 'Administración del portal' },
      { clave: 'tableros', nombre: 'Tableros' },
    ];
  });

  ngOnInit(): void {
    this.api.get<Rol[]>('/roles').subscribe({
      next: (rs) => {
        this.roles.set(rs);
        if (rs.length && this.rolActivoId() === null) this.elegirRol(rs[0].id);
        rs.forEach((r) => this.contarDe(r.id));
      },
      error: (e: Error) => this.toast.error('No se pudieron cargar los roles', e.message),
    });
    this.api.get<Metrica[]>('/metricas').subscribe({ next: (ms) => this.metricas.set(ms) });
    this.api.get<Hecho[]>('/hechos').subscribe({ next: (hs) => this.hechos.set(hs) });
  }

  elegirRol(id: number): void {
    this.rolActivoId.set(id);
    this.cargando.set(true);
    this.api.get<Autorizacion[]>(`/autorizaciones?rolId=${id}`).subscribe({
      next: (as) => {
        this.autorizaciones.set(as);
        this.conteo.update((c) => ({ ...c, [id]: as.length }));
        this.cargando.set(false);
      },
      error: (e: Error) => {
        this.cargando.set(false);
        this.toast.error('No se pudieron cargar las autorizaciones', e.message);
      },
    });
  }

  private contarDe(id: number): void {
    this.api.get<Autorizacion[]>(`/autorizaciones?rolId=${id}`).subscribe({
      next: (as) => this.conteo.update((c) => ({ ...c, [id]: as.length })),
    });
  }

  alCambiarTipo(): void {
    this.nueva.recursoClave = '*';
  }

  agregar(): void {
    const rolId = this.rolActivoId();
    if (rolId === null) return;
    this.guardando.set(true);
    this.api.post('/autorizaciones', { rolId, ...this.nueva }).subscribe({
      next: () => {
        this.guardando.set(false);
        this.toast.exito('Autorización agregada');
        this.elegirRol(rolId);
      },
      error: (e: Error) => {
        this.guardando.set(false);
        this.toast.error('No se pudo agregar', e.message);
      },
    });
  }

  quitar(a: Autorizacion): void {
    const rolId = this.rolActivoId();
    this.api.delete(`/autorizaciones/${a.id}`).subscribe({
      next: () => {
        this.toast.info('Autorización quitada');
        if (rolId !== null) this.elegirRol(rolId);
      },
      error: (e: Error) => this.toast.error('No se pudo quitar', e.message),
    });
  }

  etiquetaTipo(t: string): string {
    return { dominio: 'Dominio', metrica: 'Métrica', portal: 'Portal' }[t] ?? t;
  }

  etiquetaPermiso(p: string): string {
    return (
      { leer: 'Leer', invocar: 'Invocar', certificar: 'Certificar', administrar: 'Administrar' }[
        p
      ] ?? p
    );
  }

  nombreRecurso(tipo: string, clave: string): string {
    if (tipo === 'metrica') {
      return this.metricas().find((m) => m.clave === clave)?.nombreOficial ?? clave;
    }
    if (tipo === 'dominio') return nombreDominio(clave);
    return clave;
  }

}
