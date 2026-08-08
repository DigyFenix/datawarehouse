import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { DrawerComponent } from '../../core/drawer.component';
import { EntradaAuditoria } from '../../core/modelos';
import { OrganizacionService } from '../../core/organizacion.service';
import { ToastService } from '../../core/toast.service';

const LIMITE_PAGINA = 50;

interface CambioCampo {
  campo: string;
  antes: string;
  despues: string;
}

@Component({
  selector: 'app-auditoria',
  standalone: true,
  imports: [DatePipe, FormsModule, DrawerComponent],
  template: `
    <div class="page-header">
      <div class="titulo-grupo">
        <span class="eyebrow">Trazabilidad</span>
        <h2>Auditoría</h2>
      </div>
    </div>

    <div class="filtros">
      <div class="campo">
        <label>Organización</label>
        <select [(ngModel)]="fOrganizacionId" (ngModelChange)="cambiarOrganizacion()">
          <option value="">Todas</option>
          @for (o of orgs.organizaciones(); track o.id) { <option [value]="o.id">{{ o.nombre }}</option> }
        </select>
      </div>
      <div class="campo">
        <label>Acción</label>
        <select [(ngModel)]="fAccion" (ngModelChange)="sincronizar()">
          <option value="">Todas</option>
          @for (a of acciones(); track a) { <option [value]="a">{{ etiquetaAccion(a) }}</option> }
        </select>
      </div>
      <div class="campo">
        <label>Entidad</label>
        <select [(ngModel)]="fEntidad" (ngModelChange)="sincronizar()">
          <option value="">Todas</option>
          @for (e of entidades(); track e) { <option [value]="e">{{ etiquetaEntidad(e) }}</option> }
        </select>
      </div>
      <div class="campo" style="flex:1;">
        <label>Usuario o ID</label>
        <input [(ngModel)]="fTexto" (ngModelChange)="sincronizar()" placeholder="Buscar por usuario o ID de registro…" />
      </div>
      <button class="secundario" (click)="limpiar()" [disabled]="!hayFiltro()">Limpiar</button>
    </div>

    <div class="tarjeta" style="padding:0;">
      <div class="tabla-wrap">
        <table>
          <thead>
            <tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>ID</th><th></th></tr>
          </thead>
          <tbody>
            @for (e of filtradas(); track e.id) {
              <tr>
                <td style="white-space:nowrap;">{{ e.ocurridoEn | date: 'dd MMM, HH:mm' }}</td>
                <td>{{ e.usuarioEmail ?? 'sistema' }}</td>
                <td><span class="badge badge--neutral">{{ etiquetaAccion(e.accion) }}</span></td>
                <td><code>{{ e.entidad }}</code></td>
                <td><code>{{ e.entidadId ?? '—' }}</code></td>
                <td style="text-align:right;"><button class="secundario pequeno" (click)="ver(e)">Ver cambios</button></td>
              </tr>
            } @empty {
              <tr><td colspan="6"><div class="vacio"><strong>Sin registros</strong>Ajusta los filtros o realiza una acción en el portal.</div></td></tr>
            }
          </tbody>
        </table>
      </div>
      <div class="paginacion">
        <span class="contador">{{ entradas().length }} registro(s) cargado(s)</span>
        @if (hayMas()) {
          <button class="secundario" (click)="cargarMas()" [disabled]="cargandoMas()">
            {{ cargandoMas() ? 'Cargando…' : 'Cargar más' }}
          </button>
        }
      </div>
    </div>

    @if (detalle(); as e) {
      <app-drawer [titulo]="etiquetaAccion(e.accion) + ' · ' + etiquetaEntidad(e.entidad)" [eyebrow]="'Registro ' + (e.entidadId ?? '—')" (cerrar)="detalle.set(null)">
        <dl class="meta">
          <div><dt>Fecha</dt><dd>{{ e.ocurridoEn | date: 'dd MMM y, HH:mm:ss' }}</dd></div>
          <div><dt>Usuario</dt><dd>{{ e.usuarioEmail ?? 'sistema' }}</dd></div>
          <div><dt>Origen</dt><dd>{{ e.ip ?? '—' }}</dd></div>
        </dl>

        <h4 style="margin:18px 0 10px;">Qué cambió</h4>
        @if (cambios(e).length) {
          <table class="diff">
            <thead><tr><th>Campo</th><th>Antes</th><th>Después</th></tr></thead>
            <tbody>
              @for (c of cambios(e); track c.campo) {
                <tr>
                  <td><code>{{ c.campo }}</code></td>
                  <td class="antes">{{ c.antes }}</td>
                  <td class="despues">{{ c.despues }}</td>
                </tr>
              }
            </tbody>
          </table>
        } @else {
          <p style="color:var(--muted); font-size:13.5px;">Este evento no registró cambios de campos (p. ej. inicio de sesión).</p>
        }
      </app-drawer>
    }
  `,
  styles: [`
    .filtros { display: flex; gap: 14px; align-items: flex-end; margin-bottom: 18px; flex-wrap: wrap; }
    .filtros .campo { margin: 0; min-width: 150px; }
    .paginacion { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 15px; border-top: 1px solid var(--border); }
    .paginacion .contador { font-size: 12.5px; color: var(--muted); }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; margin: 0; }
    .meta dt { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--faint); }
    .meta dd { margin: 2px 0 0; font-size: 13.5px; }
    table.diff td { vertical-align: top; font-size: 13px; }
    table.diff .antes { color: var(--muted); text-decoration: line-through; }
    table.diff .despues { color: var(--ok); }
  `],
})
export class AuditoriaComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  readonly orgs = inject(OrganizacionService);

  readonly entradas = signal<EntradaAuditoria[]>([]);
  readonly detalle = signal<EntradaAuditoria | null>(null);
  readonly cargandoMas = signal(false);
  // Si la última página trajo menos que el límite, no hay más por cargar.
  readonly hayMas = signal(true);

  fAccion = '';
  fEntidad = '';
  fTexto = '';
  fOrganizacionId = '';
  // Espejo en signals para que los computed reaccionen a los ngModel.
  private readonly _accion = signal('');
  private readonly _entidad = signal('');
  private readonly _texto = signal('');

  readonly acciones = computed(() => [...new Set(this.entradas().map((e) => e.accion))].sort());

  /**
   * La auditoría guarda claves técnicas (`crear_version`, `asignar_rol`) porque son
   * estables y consultables. Quien lee la bitácora necesita la frase, no la clave.
   * Lo no traducido cae al formateo genérico en vez de desaparecer.
   */
  private static readonly ACCIONES: Record<string, string> = {
    crear: 'Creación',
    actualizar: 'Actualización',
    eliminar: 'Eliminación',
    login: 'Inicio de sesión',
    asignar_rol: 'Rol asignado',
    quitar_rol: 'Rol retirado',
    crear_version: 'Nueva versión',
    enviar_revision: 'Enviada a revisión',
    votar_aprobacion: 'Voto de aprobación',
    certificar: 'Certificación',
    deprecar: 'Baja de métrica',
    descubrir: 'Descubrimiento de campos',
    extraer: 'Extracción',
    transformar: 'Transformación',
    provisionar: 'Provisión de organización',
    bootstrap_admin: 'Alta del administrador inicial',
    siembra_admin: 'Alta del administrador del portal',
  };

  private static readonly ENTIDADES: Record<string, string> = {
    organizaciones: 'Organización',
    organizaciones_logo: 'Logotipo',
    sociedades: 'Sociedad',
    conexiones: 'Conexión',
    usuarios: 'Usuario',
    usuario_roles: 'Roles de usuario',
    autorizaciones: 'Autorización',
    catalogo_metricas: 'Métrica',
    metrica_versiones: 'Versión de métrica',
    glosario_negocio: 'Glosario',
    politica_ingesta: 'Política de ingesta',
    campo_ingesta: 'Campos de ingesta',
    nits_afiliados: 'NIT afiliado',
    portal_tableros: 'Tablero',
  };

  etiquetaAccion(clave: string): string {
    return AuditoriaComponent.ACCIONES[clave] ?? this.enBonito(clave);
  }

  etiquetaEntidad(clave: string): string {
    return AuditoriaComponent.ENTIDADES[clave] ?? this.enBonito(clave);
  }

  private enBonito(clave: string): string {
    const texto = clave.replace(/_/g, ' ');
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }
  readonly entidades = computed(() => [...new Set(this.entradas().map((e) => e.entidad))].sort());

  readonly filtradas = computed(() => {
    const acc = this._accion();
    const ent = this._entidad();
    const txt = this._texto().toLowerCase().trim();
    return this.entradas().filter((e) => {
      if (acc && e.accion !== acc) return false;
      if (ent && e.entidad !== ent) return false;
      if (txt) {
        const enUsuario = (e.usuarioEmail ?? '').toLowerCase().includes(txt);
        const enId = (e.entidadId ?? '').toLowerCase().includes(txt);
        if (!enUsuario && !enId) return false;
      }
      return true;
    });
  });

  hayFiltro(): boolean {
    return !!(this.fAccion || this.fEntidad || this.fTexto);
  }

  ngOnInit(): void {
    this.cargarPrimeraPagina();
  }

  /** Reinicia el listado desde la primera página (cambio de organización o carga inicial). */
  private cargarPrimeraPagina(): void {
    this.entradas.set([]);
    this.hayMas.set(true);
    this.cargarPagina();
  }

  private cargarPagina(desdeId?: number): void {
    this.cargandoMas.set(true);
    this.api
      .get<EntradaAuditoria[]>('/auditoria', {
        organizacionId: this.fOrganizacionId ? Number(this.fOrganizacionId) : undefined,
        limite: LIMITE_PAGINA,
        desdeId,
      })
      .subscribe({
        next: (d) => {
          this.entradas.update((actuales) => (desdeId ? [...actuales, ...d] : d));
          this.hayMas.set(d.length === LIMITE_PAGINA);
          this.cargandoMas.set(false);
        },
        error: (e: Error) => {
          this.toast.error('No se pudo cargar la auditoría', e.message);
          this.cargandoMas.set(false);
        },
      });
  }

  /** Cursor: la página siguiente pide lo anterior al id más bajo ya cargado (orden id DESC). */
  cargarMas(): void {
    const ultima = this.entradas().at(-1);
    if (!ultima) return;
    this.cargarPagina(ultima.id);
  }

  cambiarOrganizacion(): void {
    this.cargarPrimeraPagina();
  }

  // Sincroniza ngModel -> signals en cada cambio de filtro.
  sincronizar(): void {
    this._accion.set(this.fAccion);
    this._entidad.set(this.fEntidad);
    this._texto.set(this.fTexto);
  }

  limpiar(): void {
    this.fAccion = this.fEntidad = this.fTexto = '';
    this.sincronizar();
  }

  ver(e: EntradaAuditoria): void {
    this.detalle.set(e);
  }

  /** Compara antes/después y devuelve los campos que cambiaron (ignora columnas técnicas). */
  cambios(e: EntradaAuditoria): CambioCampo[] {
    const ignorar = new Set(['creadoEn', 'actualizadoEn', 'creado_en', 'actualizado_en', 'id']);
    const antes = e.antes ?? {};
    const despues = e.despues ?? {};
    const campos = [...new Set([...Object.keys(antes), ...Object.keys(despues)])].filter((c) => !ignorar.has(c));
    const fmt = (v: unknown): string =>
      v === undefined || v === null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return campos
      .map((campo) => ({ campo, antes: fmt(antes[campo]), despues: fmt(despues[campo]) }))
      .filter((c) => c.antes !== c.despues);
  }
}
