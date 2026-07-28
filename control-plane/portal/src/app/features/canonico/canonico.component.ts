import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { CanonicoCampo, CanonicoEntidad } from '../../core/modelos';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-canonico',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="page-header">
      <div class="titulo-grupo">
        <span class="eyebrow">Plano de datos · capa plata</span>
        <h2>Modelo canónico</h2>
      </div>
      <button (click)="nuevaAbierta.set(!nuevaAbierta())">+ Nueva entidad</button>
    </div>
    <p class="ayuda">El destino agnóstico del mapeo (Silver). Entra a una entidad para configurar sus campos.</p>

    @if (nuevaAbierta()) {
      <div class="tarjeta caja">
        <div class="fila-form">
          <input [(ngModel)]="neClave" placeholder="clave (ej. proveedor)" />
          <input [(ngModel)]="neNombre" placeholder="Nombre" />
          <input [(ngModel)]="neDominio" placeholder="dominio (ej. compras)" />
          <select [(ngModel)]="neTipo">
            <option value="dimension">dimension</option>
            <option value="hecho_cabecera">hecho_cabecera</option>
            <option value="hecho_linea">hecho_linea</option>
          </select>
          <button (click)="crearEntidad()">Crear</button>
        </div>
      </div>
    }

    <div class="tarjeta" style="padding:0;">
      <div class="tabla-wrap">
        <table>
          <thead><tr><th>Entidad</th><th>Tipo</th><th>Dominio</th><th>Campos</th><th></th></tr></thead>
          <tbody>
            @for (e of entidades(); track e.id) {
              <tr>
                <td><strong>{{ e.nombre }}</strong><br /><code>{{ e.clave }}</code></td>
                <td>{{ e.tipo }}</td>
                <td>{{ e.dominio }}</td>
                <td>{{ conteo(e.clave) }}</td>
                <td style="text-align:right;"><a class="secundario pequeno" [routerLink]="['/canonico', e.clave]">Configurar</a></td>
              </tr>
            } @empty {
              <tr><td colspan="5"><div class="vacio"><strong>Sin entidades canónicas</strong>Crea la primera entidad de tu capa plata.</div></td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .ayuda { margin:-4px 0 16px; font-size:12.5px; color:var(--muted); max-width:760px; }
    .caja { padding:14px; margin-bottom:16px; }
    .fila-form { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .fila-form input, .fila-form select { padding:6px 10px; border:1px solid var(--border); border-radius:8px; font-size:13px; }
  `],
})
export class CanonicoComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly entidades = signal<CanonicoEntidad[]>([]);
  readonly campos = signal<CanonicoCampo[]>([]);
  readonly nuevaAbierta = signal(false);

  neClave = ''; neNombre = ''; neDominio = ''; neTipo = 'dimension';

  readonly conteoPorEntidad = computed(() => {
    const m = new Map<string, number>();
    for (const c of this.campos()) m.set(c.entidadClave, (m.get(c.entidadClave) ?? 0) + 1);
    return m;
  });

  ngOnInit(): void {
    this.api.get<CanonicoEntidad[]>('/canonico/entidades').subscribe({
      next: (d) => this.entidades.set(d),
      error: (e: Error) => this.toast.error('No se pudieron cargar las entidades', e.message),
    });
    this.api.get<CanonicoCampo[]>('/canonico/campos').subscribe({
      next: (d) => this.campos.set(d),
      error: () => {},
    });
  }

  conteo(entidad: string): string {
    const n = this.conteoPorEntidad().get(entidad) ?? 0;
    return `${n} campo${n === 1 ? '' : 's'}`;
  }

  crearEntidad(): void {
    const cuerpo = {
      clave: this.neClave.trim(), nombre: this.neNombre.trim(),
      dominio: this.neDominio.trim(), tipo: this.neTipo,
    };
    if (!cuerpo.clave || !cuerpo.nombre || !cuerpo.dominio) return;
    this.api.post<CanonicoEntidad>('/canonico/entidades', cuerpo).subscribe({
      next: (e) => {
        this.entidades.update((a) => [...a, e].sort((x, y) => x.clave.localeCompare(y.clave)));
        this.nuevaAbierta.set(false);
        this.neClave = this.neNombre = this.neDominio = '';
        this.toast.exito('Entidad canónica creada', e.clave);
      },
      error: (er: Error) => this.toast.error('No se pudo crear', er.message),
    });
  }
}
