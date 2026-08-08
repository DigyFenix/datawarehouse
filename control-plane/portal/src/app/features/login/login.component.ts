import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="acceso">
      <section class="hero">
        <div class="hero__top">
          <div class="logo">P</div>
          <span class="eyebrow">Pulso · Plano de control</span>
        </div>

        <div class="hero__msg">
          <h1>Gobierno de<br />datos</h1>
          <p>Del dato crudo del ERP a métricas certificadas en las que se puede confiar.</p>
        </div>

        <!-- Firma: la escala medallion — el viaje del dato hacia la confianza -->
        <div class="escala" aria-hidden="true">
          <div class="paso">
            <span class="medalla medalla--bronce">Bronce</span>
            <div class="paso__txt"><strong>Crudo · trazable</strong><span>Tal como llega del ERP</span></div>
          </div>
          <div class="paso">
            <span class="medalla medalla--plata">Plata</span>
            <div class="paso__txt"><strong>Canónico · gobernado</strong><span>Homologado y con calidad</span></div>
          </div>
          <div class="paso">
            <span class="medalla medalla--oro">Oro</span>
            <div class="paso__txt"><strong>Certificado · listo</strong><span>Métricas que se pueden confiar</span></div>
          </div>
        </div>
      </section>

      <section class="form-panel">
        <form class="acceso-form" (ngSubmit)="entrar()">
          <span class="eyebrow">Iniciar sesión</span>
          <h2>Entra al portal</h2>
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
    /* trama técnica sutil de fondo */
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
    .hero__msg { margin-top: auto; }
    .hero__msg h1 { color: #fff; font-size: 52px; line-height: .98; letter-spacing: -.04em; }
    .hero__msg p { color: #a7bcae; font-size: 15.5px; max-width: 34ch; margin: 18px 0 0; line-height: 1.5; }

    /* Escala medallion (firma) */
    .escala { display: flex; flex-direction: column; gap: 2px; margin-bottom: 4px; }
    .paso {
      display: flex; align-items: center; gap: 14px; padding: 12px 0 12px 2px;
      position: relative; padding-left: 20px;
    }
    /* línea de linaje que conecta las capas */
    .paso::before {
      content: ""; position: absolute; left: 5px; top: 0; bottom: 0; width: 2px;
      background: color-mix(in srgb, var(--marca) 30%, #ffffff22);
    }
    .paso:first-child::before { top: 50%; }
    .paso:last-child::before { bottom: 50%; }
    .paso::after {
      content: ""; position: absolute; left: 1px; top: 50%; transform: translateY(-50%);
      width: 10px; height: 10px; border-radius: 50%;
      background: var(--brand-900); border: 2px solid color-mix(in srgb, var(--marca) 45%, #ffffff55);
    }
    .paso .medalla { flex-shrink: 0; }
    .paso__txt { display: flex; flex-direction: column; line-height: 1.3; }
    .paso__txt strong { color: #eaf1ec; font-family: var(--display); font-weight: 600; font-size: 14px; }
    .paso__txt span { color: #8ba394; font-size: 12.5px; }

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
