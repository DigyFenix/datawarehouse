import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { DrawerComponent } from '../../core/drawer.component';
import { TerminoGlosario } from '../../core/modelos';
import { ToastService } from '../../core/toast.service';

interface FormTermino {
  termino: string;
  definicion: string;
  equivaleA: string;
  dominio: string;
}

@Component({
  selector: 'app-glosario',
  standalone: true,
  imports: [FormsModule, DrawerComponent],
  template: `
    <div class="page-header">
      <div class="titulo-grupo">
        <span class="eyebrow">Vocabulario</span>
        <h2>Glosario de negocio</h2>
      </div>
      <button (click)="nuevo()">+ Nuevo término</button>
    </div>

    <div class="tarjeta" style="padding:0;">
      <div class="tabla-wrap">
        <table>
          <thead><tr><th>Término</th><th>Definición</th><th>Equivale a</th><th>Dominio</th><th></th></tr></thead>
          <tbody>
            @for (t of terminos(); track t.id) {
              <tr>
                <td><strong>{{ t.termino }}</strong></td>
                <td>{{ t.definicion }}</td>
                <td>@if (t.equivaleA) { <code>{{ t.equivaleA }}</code> } @else { <span style="color:var(--faint);">—</span> }</td>
                <td>{{ t.dominio ?? '—' }}</td>
                <td style="text-align:right;"><button class="secundario pequeno" (click)="editar(t)">Editar</button></td>
              </tr>
            } @empty {
              <tr><td colspan="5"><div class="vacio"><strong>Glosario vacío</strong>Traduce el vocabulario del negocio al modelo canónico.</div></td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (abierto()) {
      <app-drawer [titulo]="edicionId() ? 'Editar término' : 'Nuevo término'" eyebrow="Glosario" (cerrar)="cerrar()">
        <form (ngSubmit)="guardar()">
          <div class="campo"><label>Término</label><input name="termino" [(ngModel)]="form.termino" required placeholder="cartón" [disabled]="!!edicionId()" /></div>
          <div class="campo"><label>Definición</label><textarea name="definicion" rows="3" [(ngModel)]="form.definicion" required></textarea></div>
          <div class="campo"><label>Equivale a (canónico)</label><input name="equivaleA" [(ngModel)]="form.equivaleA" placeholder="item.unidad_medida" /></div>
          <div class="campo"><label>Dominio</label><input name="dominio" [(ngModel)]="form.dominio" placeholder="ventas" /></div>
          @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
          <div class="acciones-fila">
            <button type="button" class="secundario" (click)="cerrar()">Cancelar</button>
            <button type="submit" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar' }}</button>
          </div>
        </form>
      </app-drawer>
    }
  `,
})
export class GlosarioComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly terminos = signal<TerminoGlosario[]>([]);
  readonly abierto = signal(false);
  readonly edicionId = signal<number | null>(null);
  readonly errorForm = signal<string | null>(null);
  readonly guardando = signal(false);

  form: FormTermino = this.vacio();

  ngOnInit(): void {
    this.cargar();
  }

  private vacio(): FormTermino {
    return { termino: '', definicion: '', equivaleA: '', dominio: '' };
  }

  cargar(): void {
    this.api.get<TerminoGlosario[]>('/glosario').subscribe({
      next: (d) => this.terminos.set(d),
      error: (e: Error) => this.toast.error('No se pudo cargar el glosario', e.message),
    });
  }

  nuevo(): void {
    this.form = this.vacio();
    this.edicionId.set(null);
    this.errorForm.set(null);
    this.abierto.set(true);
  }

  editar(t: TerminoGlosario): void {
    this.form = { termino: t.termino, definicion: t.definicion, equivaleA: t.equivaleA ?? '', dominio: t.dominio ?? '' };
    this.edicionId.set(t.id);
    this.errorForm.set(null);
    this.abierto.set(true);
  }

  cerrar(): void {
    this.abierto.set(false);
  }

  guardar(): void {
    this.errorForm.set(null);
    this.guardando.set(true);
    const id = this.edicionId();
    const cuerpo = {
      definicion: this.form.definicion,
      equivaleA: this.form.equivaleA || undefined,
      dominio: this.form.dominio || undefined,
      ...(id ? {} : { termino: this.form.termino }),
    };
    const accion = id
      ? this.api.put<TerminoGlosario>(`/glosario/${id}`, cuerpo)
      : this.api.post<TerminoGlosario>('/glosario', cuerpo);
    accion.subscribe({
      next: (t) => {
        this.toast.exito(id ? 'Término actualizado' : 'Término agregado', t.termino);
        this.guardando.set(false);
        this.abierto.set(false);
        this.cargar();
      },
      error: (e: Error) => {
        this.errorForm.set(e.message);
        this.guardando.set(false);
      },
    });
  }
}
