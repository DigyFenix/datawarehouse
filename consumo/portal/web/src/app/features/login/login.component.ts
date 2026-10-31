import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { TenantService } from '../../core/tenant.service';

/**
 * Login white-label del tenant: el branding (nombre, color, logo) se carga por el hash de la
 * URL. Una sola tarjeta centrada sobre el lienzo neutro, con un halo suave del color de la
 * organización: el formulario es lo único en pantalla.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="acceso">
      <div class="halo" aria-hidden="true"></div>
      <section class="tarjeta-acceso">
        <div class="marca" [class.marca--ancha]="tenant.logoAncho()">
          @if (tenant.logoUrl(); as logo) {
            <img [src]="logo" [alt]="tenant.nombre()" class="logo-img" (load)="tenant.medirLogo($event)" />
          } @else {
            <div class="logo">{{ iniciales() }}</div>
          }
          <div class="marca__txt">
            <strong>{{ tenant.nombre() }}</strong>
            <span>Portal de datos</span>
          </div>
        </div>

        <h1>Inicia sesión</h1>
        <p class="sub">Tableros y métricas certificadas de tu organización, en un solo lugar.</p>

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
          <button type="submit" class="entrar" [disabled]="cargando()">
            @if (cargando()) { <span class="spinner"></span> }
            {{ cargando() ? 'Verificando…' : 'Entrar' }}
          </button>
        </form>
        <p class="pie">Quilate Analytics</p>
      </section>
    </div>
  `,
  styles: [`
    .acceso { position: relative; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: var(--bg); overflow: hidden; }
    .halo {
      position: absolute; inset: auto; width: 720px; height: 720px; border-radius: 50%; pointer-events: none;
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
    .marca--ancha { flex-direction: column; align-items: flex-start; gap: 12px; }
    .marca--ancha .marca__txt strong { display: none; }
    .logo {
      width: 44px; height: 44px; border-radius: 12px; background: var(--brand-600); color: #fff;
      display: grid; place-items: center; font-weight: 700; font-size: 16px; letter-spacing: -.02em;
    }
    .logo-img { width: 44px; height: 44px; object-fit: contain; border-radius: 12px; background: #fff; padding: 3px; border: 1px solid var(--border); }
    .marca--ancha .logo-img { width: auto; max-width: 240px; height: 56px; padding: 8px 14px; }
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
  private readonly ruta = inject(ActivatedRoute);
  readonly tenant = inject(TenantService);

  email = '';
  password = '';
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    const hash = this.ruta.snapshot.paramMap.get('hash');
    if (hash) {
      this.tenant.activar(hash).subscribe({
        error: () => this.error.set('Esta dirección de acceso no es válida'),
      });
      this.auth.restaurar();
    }
  }

  iniciales(): string {
    const nombre = this.tenant.nombre();
    return nombre
      .split(/\s+/)
      .filter((p) => p.length > 2)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('') || nombre.slice(0, 2).toUpperCase();
  }

  entrar(): void {
    this.error.set(null);
    this.cargando.set(true);
    const hash = this.tenant.exigirHash();
    this.auth.login(this.email, this.password).subscribe({
      next: (d) =>
        void this.router.navigate(
          d.usuario.debeCambiarPassword ? ['/', hash, 'cambiar-password'] : ['/', hash, 'inicio'],
        ),
      error: (e: Error) => {
        this.cargando.set(false);
        this.error.set(e.message);
      },
    });
  }
}
