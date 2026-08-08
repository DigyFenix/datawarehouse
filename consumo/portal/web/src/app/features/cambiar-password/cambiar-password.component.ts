import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';

/** Cambio de contraseña (forzado tras la contraseña temporal, o voluntario). */
@Component({
  selector: 'app-cambiar-password',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="panel">
      <form class="form" (ngSubmit)="cambiar()">
        <span class="eyebrow">{{ tenant.nombre() }}</span>
        <h2>Cambia tu contraseña</h2>
        @if (auth.usuario()?.debeCambiarPassword) {
          <p class="sub">Tu contraseña es temporal: define una nueva para continuar.</p>
        }
        <div class="campo">
          <label for="actual">Contraseña actual</label>
          <input id="actual" type="password" name="actual" [(ngModel)]="actual" required autocomplete="current-password" />
        </div>
        <div class="campo">
          <label for="nueva">Contraseña nueva (mínimo 8 caracteres)</label>
          <input id="nueva" type="password" name="nueva" [(ngModel)]="nueva" required minlength="8" autocomplete="new-password" />
        </div>
        <div class="campo">
          <label for="confirma">Confirma la contraseña nueva</label>
          <input id="confirma" type="password" name="confirma" [(ngModel)]="confirma" required autocomplete="new-password" />
        </div>
        @if (error()) { <p class="error" aria-live="polite">{{ error() }}</p> }
        <button type="submit" [disabled]="cargando()">
          @if (cargando()) { <span class="spinner"></span> }
          {{ cargando() ? 'Guardando…' : 'Guardar' }}
        </button>
      </form>
    </div>
  `,
  styles: [`
    .panel { min-height: 100vh; display: grid; place-items: center; background: var(--bg); padding: 24px; }
    .form { width: 100%; max-width: 380px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); padding: 28px; }
    .form h2 { margin: 8px 0 4px; }
    .sub { color: var(--muted); font-size: var(--fs-base); margin: 0 0 18px; }
    button { width: 100%; margin-top: 10px; padding: 11px; }
  `],
})
export class CambiarPasswordComponent {
  readonly auth = inject(AuthService);
  readonly tenant = inject(TenantService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  actual = '';
  nueva = '';
  confirma = '';
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  cambiar(): void {
    this.error.set(null);
    if (this.nueva !== this.confirma) {
      this.error.set('Las contraseñas nuevas no coinciden');
      return;
    }
    this.cargando.set(true);
    this.auth.cambiarPassword(this.actual, this.nueva).subscribe({
      next: () => {
        this.toast.exito('Contraseña actualizada');
        void this.router.navigate(['/', this.tenant.exigirHash(), 'inicio']);
      },
      error: (e: Error) => {
        this.error.set(e.message);
        this.cargando.set(false);
      },
    });
  }
}
