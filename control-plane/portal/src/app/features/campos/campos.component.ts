import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { CampoIngesta, CanonicoCampo, PoliticaIngesta, Sociedad } from '../../core/modelos';
import { OrganizacionService } from '../../core/organizacion.service';
import { ToastService } from '../../core/toast.service';

/**
 * Pantalla de asignación de campos por entidad (patrón reutilizable "incluir / no incluir"):
 * tabla ancha, agrupada por tabla de origen, con búsqueda y acciones masivas. Guarda al instante.
 */
@Component({
  selector: 'app-campos',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="page-header">
      <div class="titulo-grupo">
        <a routerLink="/ingesta" class="volver">← Entidades</a>
        <h2>Campos · {{ nombreEntidad() }}</h2>
        <span class="eyebrow">
          {{ orgs.activa()?.nombre }} · ERP {{ orgs.activa()?.erpTipo }} ·
          {{ incluidos() }} de {{ campos().length }} columnas incluidas
        </span>
      </div>
    </div>

    <div class="barra">
      <input class="buscar" [(ngModel)]="filtro" (ngModelChange)="filtroSig.set($event)" placeholder="Buscar columna o descripción…" />
      <div class="acciones">
        <button class="secundario pequeno" (click)="incluirSugeridos()">Incluir sugeridos</button>
        <button class="secundario pequeno" (click)="marcarTodos(false)">Quitar todos</button>
      </div>
    </div>

    <div class="descubrir">
      <span>Descubrir columnas del origen para:</span>
      <select [(ngModel)]="sociedadSel">
        <option value="" disabled>Elige sociedad…</option>
        @for (s of sociedades(); track s.id) { <option [value]="s.empresaId">{{ s.nombre }} ({{ s.empresaId }})</option> }
      </select>
      <button (click)="descubrir()" [disabled]="!sociedadSel || descubriendo() || extrayendo()">
        {{ descubriendo() ? 'Descubriendo…' : 'Descubrir campos' }}
      </button>
      <button class="secundario" (click)="extraer()" [disabled]="!sociedadSel || descubriendo() || extrayendo() || transformando()">
        {{ extrayendo() ? 'Extrayendo…' : 'Extraer a Bronze' }}
      </button>
      <button class="secundario" (click)="transformarObjeto()" [disabled]="descubriendo() || extrayendo() || transformando()">
        {{ transformando() ? 'Transformando…' : 'Transformar (Bronze → Gold)' }}
      </button>
      <span class="sutil">Descubrir llena esta lista. Extraer trae los campos incluidos al Bronze. Transformar corre dbt hasta Gold.</span>
    </div>

    <div class="filtros">
      <button class="filtro-chip" [class.on]="vista()==='sugeridos'" (click)="vista.set('sugeridos')">Sugeridos <span class="n">{{ nSugeridos() }}</span></button>
      <button class="filtro-chip" [class.on]="vista()==='con_datos'" (click)="vista.set('con_datos')">Con datos <span class="n">{{ nConDatos() }}</span></button>
      <button class="filtro-chip" [class.on]="vista()==='incluidos'" (click)="vista.set('incluidos')">Incluidos <span class="n">{{ incluidos() }}</span></button>
      <button class="filtro-chip" [class.on]="vista()==='todos'" (click)="vista.set('todos')">Todos <span class="n">{{ campos().length }}</span></button>
    </div>

    @for (cob of cobertura(); track cob.entidad) {
      <div class="cobertura">
        <div class="cob-head">
          <span class="medalla medalla--plata">{{ cob.entidad }}</span>
          <span class="sutil">capa plata · {{ cob.cubiertos }}/{{ cob.total }} campos cubiertos</span>
        </div>
        <div class="cob-chips">
          @for (f of cob.filas; track f.nombre) {
            <span class="cob-chip" [class.ok]="f.cubierto"
                  [title]="f.cubierto ? ('cubierto por ' + f.porColumna) : 'pendiente de mapear'">
              {{ f.nombre }}@if (f.requerido && !f.cubierto) { <span class="req" title="requerido">*</span> }
            </span>
          }
        </div>
      </div>
    }

    <p class="nota">
      Marca qué columnas entran al flujo (<strong>Incluir</strong>) y a qué campo canónico se
      mapean (<strong>Mapea a</strong>). Ej.: si <code>Territory</code> viene vacío, mapea
      <code>region</code> desde el UDF correcto. Mapear un campo lo incluye automáticamente.
      Las <span class="badge sug">sugeridas</span> las recomienda el motor.
      <br />
      Cada campo canónico admite <strong>una sola</strong> columna de origen: el desplegable
      ofrece los que están sin asignar y muestra los ya tomados en gris con la columna que los
      ocupa. Para reasignar uno, ponlo en <em>extra · solo Bronze</em> en la otra fila y vuelve
      a quedar libre. El <code>*</code> marca los campos requeridos de la entidad.
    </p>

    @for (grupo of grupos(); track grupo.tabla) {
      <div class="tarjeta grupo">
        <div class="grupo-head">
          <span>
            <code>{{ grupo.tabla }}</code> · {{ grupo.campos.length }} columnas · {{ contar(grupo.campos) }} incluidas
            @if (grupo.entidad) { <span class="destino-ent">→ capa plata: <code>{{ grupo.entidad }}</code></span> }
          </span>
          <span>
            @if (grupo.entidad) { <button class="enlace" (click)="abrirNuevoCanonico(grupo.entidad)">+ campo canónico</button> }
            <button class="enlace" (click)="marcarGrupo(grupo.campos, true)">todos</button>
            <button class="enlace" (click)="marcarGrupo(grupo.campos, false)">ninguno</button>
          </span>
        </div>
        @if (nuevoCanonicoEnt() === grupo.entidad && grupo.entidad) {
          <div class="nuevo-canon">
            <span>Nuevo campo canónico en <code>{{ grupo.entidad }}</code>:</span>
            <input [(ngModel)]="ncNombre" placeholder="nombre (ej. limite_credito)" />
            <select [(ngModel)]="ncTipo">
              <option value="text">text</option><option value="numeric">numeric</option>
              <option value="date">date</option><option value="integer">integer</option><option value="boolean">boolean</option>
            </select>
            <button class="secundario pequeno" (click)="nuevoCanonicoEnt.set(null)">Cancelar</button>
            <button class="pequeno" (click)="crearCanonico(grupo.entidad)">Agregar</button>
          </div>
        }
        <div class="tabla-wrap">
          <table>
            <thead><tr><th class="c-check">Incluir</th><th>Columna</th><th>Descripción</th><th>Mapea a</th><th>Transformación</th></tr></thead>
            <tbody>
              @for (c of grupo.campos; track c.id) {
                <tr [class.on]="c.incluido" (click)="toggle(c)">
                  <td class="c-check"><input type="checkbox" [checked]="c.incluido" (click)="$event.stopPropagation()" (change)="toggle(c)" /></td>
                  <td>
                    <code>{{ c.campoOrigen }}</code>
                    @if (c.esUdf) { <span class="badge udf">UDF</span> }
                    @if (c.sugerido) { <span class="badge sug">sugerido</span> }
                    @if (c.tieneDatos === false) { <span class="badge nodata">sin datos</span> }
                    <span class="tipo">{{ c.tipoOrigen }}</span>
                  </td>
                  <td class="desc">{{ c.descripcion }}</td>
                  <td (click)="$event.stopPropagation()">
                    <!-- Solo los destinos libres son elegibles. Los que ya tomó otra columna
                         se listan deshabilitados con su dueño: evita mapear dos columnas al
                         mismo campo canónico sin que el destino desaparezca sin explicación. -->
                    <select class="map-sel" [class.dup]="duplicado(c)"
                            [ngModel]="c.campoCanonico ?? ''" (ngModelChange)="mapear(c, $event)">
                      <option value="">— extra · solo Bronze —</option>
                      @if (disponiblesDe(c).length) {
                        <optgroup label="Sin asignar">
                          @for (cn of disponiblesDe(c); track cn.id) {
                            <option [value]="cn.nombre">{{ cn.nombre }}{{ cn.requerido ? ' *' : '' }}</option>
                          }
                        </optgroup>
                      }
                      @if (ocupadosDe(c).length) {
                        <optgroup label="Ya asignados — libéralos primero">
                          @for (o of ocupadosDe(c); track o.nombre) {
                            <option [value]="o.nombre" disabled>{{ o.nombre }} · en {{ o.porColumna }}</option>
                          }
                        </optgroup>
                      }
                    </select>
                    @if (duplicado(c); as otra) {
                      <span class="aviso-dup" [title]="'Mismo destino canónico que ' + otra">
                        duplica con {{ otra }}
                      </span>
                    }
                  </td>
                  <td (click)="$event.stopPropagation()">
                    @if (c.campoCanonico) {
                      <select class="map-sel" [ngModel]="c.transformacion" (ngModelChange)="transformar(c, $event)">
                        @for (t of TRANSFORMS; track t) { <option [value]="t">{{ t }}</option> }
                      </select>
                    } @else { <span class="faint">—</span> }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    } @empty {
      <div class="tarjeta"><div class="vacio"><strong>Sin campos</strong>Esta entidad no tiene campos configurados aún.</div></div>
    }
  `,
  styles: [`
    .titulo-grupo { display:flex; flex-direction:column; gap:2px; }
    .volver { font-size:12.5px; color:var(--brand-600,#2f6b3f); text-decoration:none; }
    .volver:hover { text-decoration:underline; }
    .barra { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:4px 0 10px; }
    .buscar { flex:1; max-width:420px; padding:8px 12px; border:1px solid var(--border); border-radius:8px; font-size:13.5px; }
    .acciones { display:flex; gap:8px; }
    .descubrir { display:flex; align-items:center; gap:10px; flex-wrap:wrap; background:var(--surface-2,#f6f8f6); border:1px solid var(--border); border-radius:10px; padding:12px 14px; margin:0 0 14px; font-size:13px; color:var(--muted); }
    .descubrir select { padding:6px 10px; border:1px solid var(--border); border-radius:8px; }
    .filtros { display:flex; gap:8px; margin:0 0 10px; flex-wrap:wrap; }
    .filtro-chip { display:inline-flex; align-items:center; gap:6px; background:var(--surface,#fff); border:1px solid var(--border); border-radius:20px; padding:5px 12px; font-size:12.5px; color:var(--muted); cursor:pointer; }
    .filtro-chip:hover { border-color:var(--brand-400,#6fa17d); }
    .filtro-chip.on { background:var(--brand-600,#2f6b3f); color:#fff; border-color:var(--brand-600,#2f6b3f); }
    .filtro-chip .n { font-weight:700; opacity:.75; }
    .cobertura { background:var(--surface); border:1px solid var(--border); border-radius:11px; padding:12px 14px; margin:0 0 12px; }
    .cob-head { display:flex; align-items:center; gap:10px; margin-bottom:9px; }
    .cob-chips { display:flex; flex-wrap:wrap; gap:6px; }
    .cob-chip { font-family:var(--mono); font-size:11.5px; padding:3px 9px; border-radius:999px; border:1px dashed var(--border-2); color:var(--muted); background:var(--surface-2); }
    .cob-chip.ok { border-style:solid; border-color:transparent; background:color-mix(in srgb, var(--marca) 12%, #fff); color:var(--brand-700); }
    .cob-chip .req { color:var(--danger); margin-left:1px; }
    .nota { font-size:12.5px; color:var(--muted); margin:0 0 16px; max-width:820px; }
    .tipo { font-size:10.5px; color:var(--faint); font-family:var(--mono,monospace); margin-left:6px; }
    .map-sel { padding:4px 8px; border:1px solid var(--border); border-radius:6px; font-size:12px; max-width:220px; background:var(--surface,#fff); }
    .map-sel.dup { border-color:var(--danger,#b23b3b); }
    .aviso-dup { display:block; margin-top:3px; font-size:11px; color:var(--danger,#b23b3b); }
    .destino-ent { margin-left:8px; color:var(--brand-700,#2f6b3f); }
    .nuevo-canon { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:10px 16px; background:var(--surface-2,#f6f8f6); border-bottom:1px solid var(--border); font-size:12.5px; color:var(--muted); }
    .nuevo-canon input, .nuevo-canon select { padding:5px 8px; border:1px solid var(--border); border-radius:6px; font-size:12.5px; }
    .badge.nodata { background:#f3eded; color:#8a5b5b; }
    .grupo { padding:0; margin-bottom:16px; }
    .grupo-head { display:flex; align-items:center; justify-content:space-between; padding:11px 16px; border-bottom:1px solid var(--border); font-size:12.5px; color:var(--muted); }
    .enlace { background:none; border:none; color:var(--brand-600,#2f6b3f); font-size:12px; cursor:pointer; padding:2px 6px; }
    .enlace:hover { text-decoration:underline; }
    table { width:100%; }
    .c-check { width:64px; text-align:center; }
    tbody tr { cursor:pointer; }
    tbody tr:hover { background:var(--surface-2,#f6f8f6); }
    tbody tr.on { background:var(--brand-50,#eef4ee); }
    .desc { color:var(--muted); font-size:12.5px; max-width:360px; }
    .faint { color:var(--faint); }
    .chip { background:var(--surface-2,#eef1f6); color:var(--muted); border-radius:6px; padding:2px 8px; font-size:11.5px; font-family:var(--mono,monospace); }
    .badge { font-size:10px; text-transform:uppercase; letter-spacing:.03em; border-radius:4px; padding:1px 5px; font-weight:600; margin-left:4px; }
    .badge.udf { background:#eef1f6; color:#4b5a76; }
    .badge.sug { background:var(--amber-100,#fdf0d5); color:var(--amber-700,#8a5a00); }
  `],
})
export class CamposComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly ruta = inject(ActivatedRoute);
  readonly orgs = inject(OrganizacionService);

  readonly campos = signal<CampoIngesta[]>([]);
  readonly sociedades = signal<Sociedad[]>([]);
  readonly nombreEntidad = signal('');
  readonly filtroSig = signal('');
  readonly vista = signal<'sugeridos' | 'con_datos' | 'incluidos' | 'todos'>('sugeridos');
  readonly descubriendo = signal(false);
  readonly extrayendo = signal(false);
  readonly transformando = signal(false);
  readonly nuevoCanonicoEnt = signal<string | null>(null);
  filtro = '';
  sociedadSel = '';
  ncNombre = '';
  ncTipo = 'text';
  private objeto = '';

  readonly TRANSFORMS = ['directo', 'booleano_yn', 'signo_nc', 'cast_fecha', 'cast_numeric', 'region'];

  readonly incluidos = computed(() => this.campos().filter((c) => c.incluido).length);
  readonly nSugeridos = computed(() => this.campos().filter((c) => c.sugerido).length);
  readonly nConDatos = computed(() => this.campos().filter((c) => c.tieneDatos === true).length);

  // Campos canónicos (capa plata) cargados del catálogo administrable.
  readonly canonicoCampos = signal<CanonicoCampo[]>([]);

  /** Opciones de mapeo para una entidad canónica (destino). */
  canonicosDe(entidad: string | null): CanonicoCampo[] {
    if (!entidad) return [];
    return this.canonicoCampos().filter((c) => c.entidadClave === entidad);
  }

  /**
   * Qué columna ocupa cada campo canónico, indexado por `entidad|campo`.
   * Solo cuentan las columnas **incluidas**: una asignada pero excluida no llega a la
   * capa plata, así que no reserva el destino.
   */
  private readonly ocupacion = computed(() => {
    const mapa = new Map<string, CampoIngesta>();
    for (const c of this.campos()) {
      if (c.canonicoEntidad && c.campoCanonico && c.incluido) {
        mapa.set(`${c.canonicoEntidad}|${c.campoCanonico}`, c);
      }
    }
    return mapa;
  });

  /**
   * Campos canónicos que esta columna puede tomar: los libres más el que ya tiene
   * asignado (si no apareciera, el select se mostraría vacío).
   */
  disponiblesDe(c: CampoIngesta): CanonicoCampo[] {
    return this.canonicosDe(c.canonicoEntidad).filter((cn) => {
      const ocupante = this.ocupacion().get(`${c.canonicoEntidad}|${cn.nombre}`);
      return !ocupante || ocupante.id === c.id;
    });
  }

  /**
   * Campos canónicos ya tomados por OTRA columna. Se listan deshabilitados, con el nombre
   * de la columna que los ocupa: así se ve por qué no están disponibles en vez de
   * desaparecer sin explicación. Para reasignar, primero se libera en la otra fila.
   */
  ocupadosDe(c: CampoIngesta): { nombre: string; porColumna: string }[] {
    const fuera: { nombre: string; porColumna: string }[] = [];
    for (const cn of this.canonicosDe(c.canonicoEntidad)) {
      const ocupante = this.ocupacion().get(`${c.canonicoEntidad}|${cn.nombre}`);
      if (ocupante && ocupante.id !== c.id) {
        fuera.push({ nombre: cn.nombre, porColumna: ocupante.campoOrigen });
      }
    }
    return fuera;
  }

  /**
   * Esta columna comparte destino canónico con otra ya incluida (mapeo duplicado creado
   * antes de que la UI lo impidiera). Se marca en la fila para poder corregirlo.
   */
  duplicado(c: CampoIngesta): string | null {
    if (!c.canonicoEntidad || !c.campoCanonico || !c.incluido) return null;
    const otra = this.campos().find(
      (x) =>
        x.id !== c.id &&
        x.incluido &&
        x.canonicoEntidad === c.canonicoEntidad &&
        x.campoCanonico === c.campoCanonico,
    );
    return otra?.campoOrigen ?? null;
  }

  /** Cobertura de la capa plata: por entidad canónica, qué campos ya están cubiertos (mapeados + incluidos). */
  readonly cobertura = computed(() => {
    const entidades = [...new Set(this.campos().map((c) => c.canonicoEntidad).filter((v): v is string => !!v))];
    return entidades.map((ent) => {
      const filas = this.canonicosDe(ent).map((cc) => {
        const cubre = this.campos().find(
          (c) => c.canonicoEntidad === ent && c.campoCanonico === cc.nombre && c.incluido,
        );
        return { nombre: cc.nombre, requerido: cc.requerido, cubierto: !!cubre, porColumna: cubre?.campoOrigen ?? null };
      });
      return { entidad: ent, filas, cubiertos: filas.filter((f) => f.cubierto).length, total: filas.length };
    });
  });

  readonly grupos = computed<{ tabla: string; entidad: string | null; campos: CampoIngesta[] }[]>(() => {
    const q = this.filtroSig().trim().toLowerCase();
    const v = this.vista();
    const lista = this.campos().filter((c) => {
      if (v === 'sugeridos' && !c.sugerido) return false;
      if (v === 'con_datos' && c.tieneDatos !== true) return false;
      if (v === 'incluidos' && !c.incluido) return false;
      if (q && !(c.campoOrigen.toLowerCase().includes(q) || (c.descripcion ?? '').toLowerCase().includes(q))) return false;
      return true;
    });
    const grupos: { tabla: string; entidad: string | null; campos: CampoIngesta[] }[] = [];
    for (const c of lista) {
      let g = grupos.find((x) => x.tabla === c.tablaOrigen);
      if (!g) { g = { tabla: c.tablaOrigen, entidad: c.canonicoEntidad, campos: [] }; grupos.push(g); }
      g.campos.push(c);
    }
    return grupos;
  });

  ngOnInit(): void {
    this.objeto = this.ruta.snapshot.paramMap.get('objeto') ?? '';
    this.nombreEntidad.set(this.objeto);
    const organizacionId = this.orgs.activaId();
    if (organizacionId === null) {
      this.toast.error('Sin organización activa', 'Selecciona una organización en la barra superior.');
      return;
    }
    this.api.get<PoliticaIngesta[]>('/ingesta/politicas', { organizacionId }).subscribe({
      next: (d) => {
        const p = d.find((x) => x.objeto === this.objeto);
        if (p) this.nombreEntidad.set(p.nombreNegocio);
      },
      error: () => {},
    });
    // Solo sociedades de la organización activa: descubrir/extraer contra el origen de
    // otro tenant sería un cruce de datos (la API lo rechaza, la UI no lo ofrece).
    this.api.get<Sociedad[]>('/sociedades', { organizacionId }).subscribe({
      next: (d) => {
        this.sociedades.set(d);
        if (!this.sociedadSel && d.length) this.sociedadSel = d[0].empresaId;
      },
      error: () => {},
    });
    this.cargar();
  }

  descubrir(): void {
    if (!this.sociedadSel) return;
    this.descubriendo.set(true);
    this.api
      .post<{ descubiertos: number; sugeridos: number; con_datos: number; tablas: string[] }>(
        '/ingesta/descubrir',
        { organizacionId: this.orgs.exigirId(), objeto: this.objeto, sociedad: this.sociedadSel },
      )
      .subscribe({
        next: (r) => {
          this.descubriendo.set(false);
          this.toast.exito(
            'Introspección completa',
            `${r.descubiertos} columnas · ${r.sugeridos} sugeridas · ${r.con_datos} con datos`,
          );
          this.cargar();
        },
        error: (e: Error) => {
          this.descubriendo.set(false);
          this.toast.error('No se pudo descubrir', e.message);
        },
      });
  }

  extraer(): void {
    if (!this.sociedadSel) return;
    this.extrayendo.set(true);
    this.api
      .post<{ filas: number; estrategia: string; tablas: Record<string, number> }>('/ingesta/extraer', {
        organizacionId: this.orgs.exigirId(),
        objeto: this.objeto,
        sociedad: this.sociedadSel,
      })
      .subscribe({
        next: (r) => {
          this.extrayendo.set(false);
          this.toast.exito('Extracción a Bronze completa', `${r.filas} filas · ${r.estrategia}`);
        },
        error: (e: Error) => {
          this.extrayendo.set(false);
          this.toast.error('No se pudo extraer', e.message);
        },
      });
  }

  transformarObjeto(): void {
    this.transformando.set(true);
    this.api
      .post<{ selector: string; nodos: number }>('/ingesta/transformar', {
        organizacionId: this.orgs.exigirId(),
        objeto: this.objeto,
        sociedad: this.sociedadSel || undefined,
      })
      .subscribe({
        next: (r) => {
          this.transformando.set(false);
          this.toast.exito('Transformación completa', `dbt build · ${r.nodos} modelo(s) · ${r.selector}`);
        },
        error: (e: Error) => {
          this.transformando.set(false);
          this.toast.error('No se pudo transformar', e.message);
        },
      });
  }

  cargar(): void {
    const organizacionId = this.orgs.activaId();
    if (organizacionId === null) return;
    this.api
      .get<CampoIngesta[]>('/ingesta/campos', { organizacionId, objeto: this.objeto })
      .subscribe({
        next: (d) => this.campos.set(d),
        error: (e: Error) => this.toast.error('No se pudieron cargar los campos', e.message),
      });
    this.api.get<CanonicoCampo[]>('/canonico/campos').subscribe({
      next: (d) => this.canonicoCampos.set(d),
      error: () => {},
    });
  }

  abrirNuevoCanonico(entidad: string): void {
    this.ncNombre = '';
    this.ncTipo = 'text';
    this.nuevoCanonicoEnt.set(entidad);
  }

  crearCanonico(entidad: string): void {
    const nombre = this.ncNombre.trim();
    if (!nombre) return;
    this.api
      .post<CanonicoCampo>('/canonico/campos', { entidadClave: entidad, nombre, tipo: this.ncTipo })
      .subscribe({
        next: (c) => {
          this.canonicoCampos.update((arr) => [...arr, c]);
          this.nuevoCanonicoEnt.set(null);
          this.toast.exito('Campo canónico creado', `${entidad}.${c.nombre}`);
        },
        error: (e: Error) => this.toast.error('No se pudo crear el campo canónico', e.message),
      });
  }

  contar(campos: CampoIngesta[]): number {
    return campos.filter((c) => c.incluido).length;
  }

  toggle(c: CampoIngesta): void {
    this.guardar([c], !c.incluido);
  }

  /** Cambia el mapeo canónico de un campo. Mapear a un canónico lo incluye automáticamente. */
  mapear(c: CampoIngesta, canonico: string): void {
    const valor = canonico || null;
    const cuerpo: Record<string, unknown> = { campoCanonico: valor };
    if (valor) cuerpo['incluido'] = true;
    this.api.put<CampoIngesta>(`/ingesta/campos/${c.id}`, cuerpo).subscribe({
      next: (act) => this.campos.update((arr) => arr.map((x) => (x.id === c.id ? act : x))),
      error: (e: Error) => this.toast.error('No se pudo mapear', e.message),
    });
  }

  transformar(c: CampoIngesta, transformacion: string): void {
    this.api.put<CampoIngesta>(`/ingesta/campos/${c.id}`, { transformacion }).subscribe({
      next: (act) => this.campos.update((arr) => arr.map((x) => (x.id === c.id ? act : x))),
      error: (e: Error) => this.toast.error('No se pudo cambiar la transformación', e.message),
    });
  }

  marcarGrupo(campos: CampoIngesta[], valor: boolean): void {
    this.guardar(campos.filter((c) => c.incluido !== valor), valor);
  }

  marcarTodos(valor: boolean): void {
    this.guardar(this.campos().filter((c) => c.incluido !== valor), valor);
  }

  incluirSugeridos(): void {
    this.guardar(this.campos().filter((c) => c.sugerido && !c.incluido), true);
  }

  /** Persiste el cambio de inclusión de un conjunto de campos y actualiza el estado local. */
  private guardar(objetivos: CampoIngesta[], valor: boolean): void {
    if (!objetivos.length) return;
    const peticiones = objetivos.map((c) =>
      this.api.put<CampoIngesta>(`/ingesta/campos/${c.id}`, { incluido: valor }),
    );
    forkJoin(peticiones).subscribe({
      next: (actualizados) => {
        const mapa = new Map<number, CampoIngesta>();
        for (const a of actualizados) mapa.set(a.id, a);
        this.campos.update((arr) => arr.map((x) => mapa.get(x.id) ?? x));
      },
      error: (e: Error) => {
        this.toast.error('No se pudo actualizar', e.message);
        this.cargar();
      },
    });
  }
}
