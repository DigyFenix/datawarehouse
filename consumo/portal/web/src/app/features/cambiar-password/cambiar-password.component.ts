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
      <form class="form" #f="ngForm" (ngSubmit)="f.valid && cambiar()">
        <span class="eyebrow">{{ tenant.nombre() }}</span>
        <h2>Cambia tu contraseña</h2>
        @if (auth.usuario()?.debeCambiarPassword) {
          <p class="sub">Tu contraseña es temporal: define una nueva para continuar.</p>
        }
        <div class="campo">
          <label for="actual">Contraseña actual</label>
          <input id="actual" type="password" name="actual" [(ngModel)]="actual" required maxlength="100" autocomplete="current-password" />
        </div>
        <div class="campo">
          <label for="nueva">Contraseña nueva (mínimo 8 caracteres)</label>
          <input id="nueva" type="password" name="nueva" [(ngModel)]="nueva" required minlength="8" maxlength="100" autocomplete="new-password" />
        </div>
        <div class="campo">
          <label for="confirma">Confirma la contraseña nueva</label>
          <input id="confirma" type="password" name="confirma" [(ngModel)]="confirma" required minlength="8" maxlength="100" autocomplete="new-password" />
          @if (confirma && nueva !== confirma) { <span class="aviso-campo">No coincide con la contraseña nueva.</span> }
        </div>
        @if (error()) { <p class="error" aria-live="polite">{{ error() }}</p> }
        <div class="acciones">
          @if (auth.usuario()?.debeCambiarPassword) {
            <!-- Con contraseña temporal no hay a dónde volver: la salida es cerrar la sesión. -->
            <button type="button" class="secundario" (click)="salir()">Cerrar sesión</button>
          } @else {
            <button type="button" class="secundario" (click)="volver()">Volver</button>
          }
          <button type="submit" [disabled]="cargando() || f.invalid || nueva !== confirma">
            @if (cargando()) { <span class="spinner"></span> }
            {{ cargando() ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .panel { min-height: 100vh; display: grid; place-items: center; background: var(--bg); padding: 24px; }
    .form { width: 100%; max-width: 380px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); padding: 28px; }
    .form h2 { margin: 8px 0 4px; }
    .sub { color: var(--muted); font-size: var(--fs-base); margin: 0 0 18px; }
    .acciones { display: flex; gap: 10px; margin-top: 10px; }
    .acciones button { flex: 1; padding: 11px; }
    .aviso-campo { display: block; margin-top: 4px; font-size: var(--fs-xs); color: var(--danger); }
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

  volver(): void {
    void this.router.navigate(['/', this.tenant.exigirHash(), 'inicio']);
  }

  salir(): void {
    const hash = this.tenant.exigirHash();
    this.auth.logout();
    void this.router.navigate(['/', hash, 'login']);
  }

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
