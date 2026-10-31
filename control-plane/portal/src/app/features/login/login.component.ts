import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth.service';

/**
 * Acceso al plano de control. Una sola tarjeta centrada sobre el lienzo neutro, con un
 * halo suave del color de marca: el formulario es lo único en pantalla (mismo patrón
 * que el login del portal de usuario).
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="acceso">
      <div class="halo" aria-hidden="true"></div>
      <section class="tarjeta-acceso">
        <div class="marca">
          <div class="logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 3h12l4 6-10 12L2 9z M2 9h20 M9 3l3 6 3-6 M12 9l-4 12 M12 9l4 12" />
            </svg>
          </div>
          <div class="marca__txt">
            <strong>Quilate Analytics</strong>
            <span>Plano de control</span>
          </div>
        </div>

        <h1>Inicia sesión</h1>
        <p class="sub">Administra organizaciones, orígenes de datos, métricas y gobierno.</p>

        <form class="acceso-form" (ngSubmit)="entrar()">
          <div class="campo">
            <label for="email">Correo</label>
            <input id="email" type="email" name="email" [(ngModel)]="email" required autocomplete="username" placeholder="nombre@empresa.com" />
          </div>
          <div class="campo">
            <label for="password">Contraseña</label>
            <input id="password" type="password" name="password" [(ngModel)]="password" required autocomplete="current-password" placeholder="••••••••" />
          </div>
          @if (error()) { <p class="error" aria-live="polite">{{ error() }}</p> }
          <button type="submit" class="entrar" [disabled]="cargando()" [attr.aria-busy]="cargando()">
            @if (cargando()) { <span class="spinner"></span> }
            {{ cargando() ? 'Verificando…' : 'Entrar' }}
          </button>
        </form>
        <p class="pie">Quilate Analytics · DigyFenix</p>
      </section>
    </div>
  `,
  styles: [`
    .acceso { position: relative; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: var(--bg); overflow: hidden; }
    .halo {
      position: absolute; width: 720px; height: 720px; border-radius: 50%; pointer-events: none;
      top: -280px; right: -200px;
      background: radial-gradient(circle, color-mix(in srgb, var(--marca) 22%, transparent), transparent 62%);
    }
    .tarjeta-acceso {
      position: relative; width: 100%; max-width: 400px;
      background: var(--surface); border: 1px solid var(--border); border-radius: 20px;
      padding: 32px; box-shadow: var(--sh-2);
      display: flex; flex-direction: column; gap: 8px;
    }
    .marca { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
    .logo {
      width: 44px; height: 44px; border-radius: 12px; background: var(--brand-600); color: #fff;
      display: grid; place-items: center;
    }
    .marca__txt { display: flex; flex-direction: column; line-height: 1.25; }
    .marca__txt strong { font-weight: 600; font-size: 15px; }
    .marca__txt span { font-size: 12.5px; color: var(--muted); }
    h1 { font-size: 24px; }
    .sub { color: var(--muted); font-size: var(--fs-base); margin: 0 0 20px; line-height: 1.5; }
    .acceso-form .campo { margin-bottom: 14px; }
    .entrar { width: 100%; margin-top: 6px; height: 42px; font-size: 15px; }
    .pie { margin: 18px 0 0; text-align: center; font-size: 11.5px; color: var(--faint); }
  `],
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  entrar(): void {
    this.error.set(null);
    this.cargando.set(true);
    this.auth.login(this.email, this.password).subscribe({
      next: () => void this.router.navigate(['/organizaciones']),
      error: (e: Error) => {
        this.error.set(e.message);
        this.cargando.set(false);
      },
    });
  }
}
