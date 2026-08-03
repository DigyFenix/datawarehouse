import { HttpClient } from '@angular/common/http';
import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { environment } from '../../../environments/environment';
import { ApiService } from '../../core/api.service';
import { DrawerComponent } from '../../core/drawer.component';
import { EstadoPortalOrg, TableroPortal } from '../../core/modelos';
import { OrganizacionService } from '../../core/organizacion.service';
import { ToastService } from '../../core/toast.service';

interface FormTablero {
  clave: string;
  nombre: string;
  descripcion: string;
  urlPublica: string;
  orden: number;
  activo: boolean;
}

interface FormAdmin {
  email: string;
  nombre: string;
  password: string;
}

/**
 * Administración del PORTAL DE USUARIO del tenant activo: URL de ingreso (hash),
 * logo (white-label), siembra del primer admin de la organización y alta de
 * tableros de Power BI (Publish to Web). La organización se auto-administra
 * después (sus usuarios y perfiles los crea su propio admin en su portal).
 */
@Component({
  selector: 'app-portal-usuario',
  standalone: true,
  imports: [FormsModule, DrawerComponent],
  template: `
    <div class="page-header">
      <div class="titulo-grupo">
        <span class="eyebrow">Consumo · portal de usuario</span>
        <h2>Portal de usuario</h2>
      </div>
      <button (click)="nuevoTablero()" [disabled]="!estado()?.esquemaAplicado">+ Nuevo tablero</button>
    </div>
    <p class="ayuda">
      Aquí se administra lo que la organización consume: su URL de ingreso, su logo y sus
      tableros de Power BI. Los usuarios y perfiles los gestiona el admin de la organización
      desde su propio portal.
    </p>

    <div class="grid2">
      <div class="tarjeta">
        <span class="eyebrow">Acceso del tenant</span>
        @if (estado(); as e) {
          <div class="fila-url">
            <code class="url">{{ urlIngreso() }}</code>
            <button class="secundario pequeno" (click)="copiarUrl()">Copiar</button>
          </div>
          <ul class="estado">
            <li>
              Esquema portal:
              @if (e.esquemaAplicado) { <strong class="ok">aplicado</strong> }
              @else { <strong class="mal">falta aplicar 110_portal_tenant.sql en {{ e.baseDatos }}</strong> }
            </li>
            <li>Usuarios: <strong>{{ e.usuarios }}</strong> · Tableros: <strong>{{ e.tableros }}</strong></li>
            <li>
              Admin de la organización:
              @if (e.adminExiste) { <strong class="ok">sembrado</strong> }
              @else if (e.esquemaAplicado) {
                <button class="secundario pequeno" (click)="abrirAdmin()">Sembrar admin</button>
              } @else { <span class="sutil">—</span> }
            </li>
          </ul>
        } @else {
          <p class="sutil">Cargando estado…</p>
        }
      </div>

      <div class="tarjeta">
        <span class="eyebrow">Marca (white-label)</span>
        <p class="sutil">El color se edita en Organizaciones; el logo aquí. El portal de usuario toma ambos.</p>
        <div class="fila-logo">
          @if (logoUrl(); as url) {
            <img [src]="url" alt="Logo del tenant" class="logo-preview" />
          } @else {
            <div class="logo-vacio">Sin logo</div>
          }
          <div class="acciones-logo">
            <label class="secundario boton-archivo">
              Subir logo
              <input type="file" accept="image/png,image/jpeg,image/webp" (change)="subirLogo($event)" hidden />
            </label>
            @if (logoUrl()) {
              <button class="secundario pequeno" (click)="eliminarLogo()">Quitar</button>
            }
          </div>
        </div>
        <span class="sutil">PNG, JPG o WebP · máx. 300 KB (SVG no: puede ejecutar código).</span>
      </div>
    </div>

    <div class="tarjeta" style="padding:0; margin-top:16px;">
      <div class="tabla-wrap">
        <table>
          <thead><tr><th>Tablero</th><th>Clave</th><th>URL pública</th><th>Orden</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            @for (t of tableros(); track t.id) {
              <tr>
                <td><strong>{{ t.nombre }}</strong>@if (t.descripcion) { <br /><span class="sutil">{{ t.descripcion }}</span> }</td>
                <td><code>{{ t.clave }}</code></td>
                <td class="celda-url"><code>{{ t.urlPublica }}</code></td>
                <td>{{ t.orden }}</td>
                <td>@if (t.activo) { <span class="ok">activo</span> } @else { <span class="sutil">inactivo</span> }</td>
                <td style="text-align:right; white-space:nowrap;">
                  <button class="secundario pequeno" (click)="editarTablero(t)">Editar</button>
                  <button class="secundario pequeno" (click)="eliminarTablero(t)">Eliminar</button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6"><div class="vacio"><strong>Sin tableros</strong>Publica el dashboard en Power BI (Publish to Web) y registra aquí su URL.</div></td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (drawerTablero()) {
      <app-drawer [titulo]="edicionId() ? 'Editar tablero' : 'Nuevo tablero'" eyebrow="Portal de usuario" (cerrar)="drawerTablero.set(false)">
        <form (ngSubmit)="guardarTablero()">
          <div class="grid2">
            <div class="campo">
              <label>Clave</label>
              <input name="clave" [(ngModel)]="formTablero.clave" required placeholder="ventas_resumen" [disabled]="!!edicionId()" />
            </div>
            <div class="campo"><label>Orden</label><input name="orden" type="number" min="0" [(ngModel)]="formTablero.orden" /></div>
          </div>
          <div class="campo"><label>Nombre</label><input name="nombre" [(ngModel)]="formTablero.nombre" required placeholder="Resumen de ventas" /></div>
          <div class="campo"><label>Descripción</label><input name="descripcion" [(ngModel)]="formTablero.descripcion" /></div>
          <div class="campo">
            <label>URL pública (Publish to Web)</label>
            <input name="urlPublica" [(ngModel)]="formTablero.urlPublica" required placeholder="https://app.powerbi.com/view?r=…" />
            <span class="sutil">La URL es pública por naturaleza (riesgo aceptado): el portal solo la muestra a usuarios con perfil autorizado y audita cada apertura.</span>
          </div>
          <label class="check"><input type="checkbox" name="activo" [(ngModel)]="formTablero.activo" /> Activo</label>
          @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
          <div class="acciones-fila">
            <button type="button" class="secundario" (click)="drawerTablero.set(false)">Cancelar</button>
            <button type="submit" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar' }}</button>
          </div>
        </form>
      </app-drawer>
    }

    @if (drawerAdmin()) {
      <app-drawer titulo="Sembrar admin de la organización" eyebrow="Portal de usuario" (cerrar)="drawerAdmin.set(false)">
        <p class="ayuda">
          Primer usuario administrador del portal de la organización. La contraseña es temporal:
          el sistema fuerza el cambio en el primer ingreso. Los demás usuarios los crea la
          propia organización.
        </p>
        <form (ngSubmit)="sembrarAdmin()">
          <div class="campo"><label>Email</label><input name="email" type="email" [(ngModel)]="formAdmin.email" required /></div>
          <div class="campo"><label>Nombre</label><input name="nombre" [(ngModel)]="formAdmin.nombre" required /></div>
          <div class="campo"><label>Contraseña temporal</label><input name="password" type="text" [(ngModel)]="formAdmin.password" required minlength="8" /></div>
          @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
          <div class="acciones-fila">
            <button type="button" class="secundario" (click)="drawerAdmin.set(false)">Cancelar</button>
            <button type="submit" [disabled]="guardando()">{{ guardando() ? 'Sembrando…' : 'Sembrar admin' }}</button>
          </div>
        </form>
      </app-drawer>
    }
  `,
  styles: [`
    .ayuda { margin:-4px 0 16px; font-size:12.5px; color:var(--muted); max-width:720px; }
    .sutil { font-size:11.5px; color:var(--faint); }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; align-items:start; }
    .check { display:flex; align-items:center; gap:8px; font-size:13.5px; margin:8px 0; color:var(--muted); }
    .fila-url { display:flex; align-items:center; gap:8px; margin:10px 0; }
    .url { font-size:12px; word-break:break-all; }
    .estado { list-style:none; padding:0; margin:8px 0 0; display:flex; flex-direction:column; gap:6px; font-size:13px; color:var(--muted); }
    .ok { color:var(--brand-600, #2c7a4b); }
    .mal { color:#b3453a; }
    .fila-logo { display:flex; align-items:center; gap:14px; margin:10px 0; }
    .logo-preview { max-height:56px; max-width:180px; border-radius:8px; border:1px solid var(--border); padding:4px; background:#fff; }
    .logo-vacio { width:120px; height:56px; border:1px dashed var(--border); border-radius:8px; display:grid; place-items:center; color:var(--faint); font-size:12px; }
    .acciones-logo { display:flex; flex-direction:column; gap:6px; }
    .boton-archivo { cursor:pointer; display:inline-block; padding:6px 12px; border:1px solid var(--border); border-radius:8px; font-size:13px; }
    .celda-url code { font-size:11px; word-break:break-all; display:inline-block; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    @media (max-width: 860px) { .grid2 { grid-template-columns:1fr; } }
  `],
})
export class PortalUsuarioComponent {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  readonly orgs = inject(OrganizacionService);

  readonly estado = signal<EstadoPortalOrg | null>(null);
  readonly tableros = signal<TableroPortal[]>([]);
  readonly logoUrl = signal<string | null>(null);
  readonly drawerTablero = signal(false);
  readonly drawerAdmin = signal(false);
  readonly edicionId = signal<number | null>(null);
  readonly errorForm = signal<string | null>(null);
  readonly guardando = signal(false);

  formTablero: FormTablero = this.tableroVacio();
  formAdmin: FormAdmin = { email: '', nombre: '', password: '' };

  constructor() {
    // cargar() escribe signals de forma síncrona (resetea estado/tableros/logo);
    // sin allowSignalWrites, Angular corta el effect con NG0600 y la pantalla
    // se queda en "Cargando estado…".
    effect(
      () => {
        this.orgs.activaId();
        this.cargar();
      },
      { allowSignalWrites: true },
    );
  }

  private tableroVacio(): FormTablero {
    return { clave: '', nombre: '', descripcion: '', urlPublica: '', orden: 0, activo: true };
  }

  urlIngreso(): string {
    const hash = this.orgs.activa()?.hashTenant ?? '';
    return `${environment.portalUsuarioUrl}/${hash}`;
  }

  copiarUrl(): void {
    void navigator.clipboard.writeText(this.urlIngreso());
    this.toast.exito('URL copiada', 'Entrégala al cliente como su acceso al portal');
  }

  cargar(): void {
    const organizacionId = this.orgs.activaId();
    this.estado.set(null);
    this.tableros.set([]);
    this.logoUrl.set(null);
    if (organizacionId === null) return;
    this.api.get<EstadoPortalOrg>(`/organizaciones/${organizacionId}/portal/estado`).subscribe({
      next: (e) => {
        this.estado.set(e);
        if (e.esquemaAplicado) this.cargarTableros(organizacionId);
      },
      error: (e: Error) => this.toast.error('No se pudo leer el estado del portal', e.message),
    });
    this.cargarLogo(organizacionId);
  }

  private cargarTableros(organizacionId: number): void {
    this.api.get<TableroPortal[]>(`/organizaciones/${organizacionId}/portal/tableros`).subscribe({
      next: (d) => this.tableros.set(d),
      error: (e: Error) => this.toast.error('No se pudieron cargar los tableros', e.message),
    });
  }

  // --- Logo (binario autenticado → object URL) ---

  private cargarLogo(organizacionId: number): void {
    if (!this.orgs.activa()?.logoMime) return;
    this.http
      .get(`${environment.apiUrl}/organizaciones/${organizacionId}/logo`, { responseType: 'blob' })
      .subscribe({
        next: (blob) => this.logoUrl.set(URL.createObjectURL(blob)),
        error: () => this.logoUrl.set(null),
      });
  }

  subirLogo(evento: Event): void {
    const archivo = (evento.target as HTMLInputElement).files?.[0];
    if (!archivo) return;
    if (archivo.size > 300 * 1024) {
      this.toast.error('Logo demasiado grande', 'El máximo es 300 KB');
      return;
    }
    const lector = new FileReader();
    lector.onload = () => {
      const resultado = String(lector.result);
      const datosBase64 = resultado.slice(resultado.indexOf(',') + 1);
      const organizacionId = this.orgs.exigirId();
      this.api
        .put(`/organizaciones/${organizacionId}/logo`, { mime: archivo.type, datosBase64 })
        .subscribe({
          next: () => {
            this.toast.exito('Logo actualizado');
            // Refresca el listado (logoMime) y la vista previa.
            this.orgs.cargar().subscribe({ next: () => this.cargarLogo(organizacionId), error: () => {} });
          },
          error: (e: Error) => this.toast.error('No se pudo subir el logo', e.message),
        });
    };
    lector.readAsDataURL(archivo);
  }

  eliminarLogo(): void {
    const organizacionId = this.orgs.exigirId();
    this.api.delete(`/organizaciones/${organizacionId}/logo`).subscribe({
      next: () => {
        this.logoUrl.set(null);
        this.toast.exito('Logo eliminado');
        this.orgs.cargar().subscribe({ error: () => {} });
      },
      error: (e: Error) => this.toast.error('No se pudo eliminar el logo', e.message),
    });
  }

  // --- Siembra del admin ---

  abrirAdmin(): void {
    this.formAdmin = { email: '', nombre: '', password: '' };
    this.errorForm.set(null);
    this.drawerAdmin.set(true);
  }

  sembrarAdmin(): void {
    this.errorForm.set(null);
    this.guardando.set(true);
    const organizacionId = this.orgs.exigirId();
    this.api.post(`/organizaciones/${organizacionId}/portal/admin`, this.formAdmin).subscribe({
      next: () => {
        this.toast.exito('Admin sembrado', this.formAdmin.email);
        this.guardando.set(false);
        this.drawerAdmin.set(false);
        this.cargar();
      },
      error: (e: Error) => {
        this.errorForm.set(e.message);
        this.guardando.set(false);
      },
    });
  }

  // --- Tableros ---

  nuevoTablero(): void {
    this.formTablero = this.tableroVacio();
    this.edicionId.set(null);
    this.errorForm.set(null);
    this.drawerTablero.set(true);
  }

  editarTablero(t: TableroPortal): void {
    this.formTablero = {
      clave: t.clave,
      nombre: t.nombre,
      descripcion: t.descripcion ?? '',
      urlPublica: t.urlPublica,
      orden: t.orden,
      activo: t.activo,
    };
    this.edicionId.set(t.id);
    this.errorForm.set(null);
    this.drawerTablero.set(true);
  }

  guardarTablero(): void {
    this.errorForm.set(null);
    this.guardando.set(true);
    const organizacionId = this.orgs.exigirId();
    const id = this.edicionId();
    const cuerpo = {
      nombre: this.formTablero.nombre,
      descripcion: this.formTablero.descripcion || undefined,
      urlPublica: this.formTablero.urlPublica,
      orden: this.formTablero.orden,
      activo: this.formTablero.activo,
      ...(id ? {} : { clave: this.formTablero.clave }),
    };
    const accion = id
      ? this.api.put<TableroPortal>(`/organizaciones/${organizacionId}/portal/tableros/${id}`, cuerpo)
      : this.api.post<TableroPortal>(`/organizaciones/${organizacionId}/portal/tableros`, cuerpo);
    accion.subscribe({
      next: (t) => {
        this.toast.exito(id ? 'Tablero actualizado' : 'Tablero creado', t.nombre);
        this.guardando.set(false);
        this.drawerTablero.set(false);
        this.cargar();
      },
      error: (e: Error) => {
        this.errorForm.set(e.message);
        this.guardando.set(false);
      },
    });
  }

  eliminarTablero(t: TableroPortal): void {
    if (!confirm(`¿Eliminar el tablero "${t.nombre}"? Los perfiles de la organización perderán la asignación.`)) return;
    const organizacionId = this.orgs.exigirId();
    this.api.delete(`/organizaciones/${organizacionId}/portal/tableros/${t.id}`).subscribe({
      next: () => {
        this.toast.exito('Tablero eliminado', t.nombre);
        this.cargar();
      },
      error: (e: Error) => this.toast.error('No se pudo eliminar', e.message),
    });
  }
}
