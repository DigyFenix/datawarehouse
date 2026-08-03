import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { TenantService } from '../../core/tenant.service';

/** Login white-label del tenant: el branding (nombre, color, logo) se carga por el hash de la URL. */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="acceso">
      <section class="hero">
        <div class="hero__top">
          @if (tenant.logoUrl(); as logo) {
            <img [src]="logo" alt="" class="logo-img" />
          } @else {
            <div class="logo">{{ iniciales() }}</div>
          }
          <span class="eyebrow">{{ tenant.nombre() }} · Portal de datos</span>
        </div>

        <div class="hero__msg">
          <h1>Tus datos,<br />gobernados</h1>
          <p>Tableros y métricas certificadas de tu organización, en un solo lugar.</p>
        </div>
      </section>

      <section class="form-panel">
        <form class="acceso-form" (ngSubmit)="entrar()">
          <span class="eyebrow">Iniciar sesión</span>
          <h2>{{ tenant.nombre() }}</h2>
          <p class="sub">Ingresa con tu cuenta.</p>

          <div class="campo">
            <label for="email">Email</label>
            <input id="email" type="email" name="email" [(ngModel)]="email" required autocomplete="username" />
          </div>
          <div class="campo">
            <label for="password">Contraseña</label>
            <input id="password" type="password" name="password" [(ngModel)]="password" required autocomplete="current-password" />
          </div>
          @if (error()) { <p class="error">{{ error() }}</p> }
          <button type="submit" class="entrar" [disabled]="cargando()">
            {{ cargando() ? 'Verificando…' : 'Entrar' }}
          </button>
        </form>
      </section>
    </div>
  `,
  styles: [`
    .acceso { display: grid; grid-template-columns: 1.1fr 1fr; min-height: 100vh; }

    .hero {
      position: relative; overflow: hidden;
      background: var(--brand-900); color: #dbe6de;
      padding: 48px 52px; display: flex; flex-direction: column; gap: 40px;
    }
    .hero::after {
      content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .5;
      background:
        radial-gradient(120% 80% at 100% 0%, color-mix(in srgb, var(--marca) 24%, transparent), transparent 60%),
        linear-gradient(180deg, transparent, color-mix(in srgb, #000 22%, transparent));
    }
    .hero > * { position: relative; z-index: 1; }
    .hero__top { display: flex; align-items: center; gap: 13px; }
    .hero .eyebrow { color: color-mix(in srgb, var(--marca) 30%, #cfe0d4); }
    .logo {
      width: 42px; height: 42px; border-radius: 11px; background: var(--amber-500);
      color: #14251a; display: grid; place-items: center;
      font-family: var(--display); font-weight: 700; font-size: 16px; letter-spacing: -.03em;
    }
    .logo-img { max-width: 46px; max-height: 46px; border-radius: 11px; background: #fff; padding: 3px; }
    .hero__msg { margin-top: auto; margin-bottom: 24px; }
    .hero__msg h1 { color: #fff; font-size: 52px; line-height: .98; letter-spacing: -.04em; }
    .hero__msg p { color: #a7bcae; font-size: 15.5px; max-width: 34ch; margin: 18px 0 0; line-height: 1.5; }

    .form-panel { display: grid; place-items: center; padding: 32px; background: var(--bg); }
    .acceso-form { width: 100%; max-width: 348px; }
    .acceso-form h2 { margin: 8px 0 4px; font-size: 26px; }
    .acceso-form .sub { color: var(--muted); font-size: 13.5px; margin: 0 0 24px; }
    .entrar { width: 100%; margin-top: 8px; padding: 11px; }

    @media (max-width: 820px) {
      .acceso { grid-template-columns: 1fr; }
      .hero { display: none; }
    }
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
        this.error.set(e.message);
        this.cargando.set(false);
      },
    });
  }
}
