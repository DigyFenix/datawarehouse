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
      <section class="marca-panel">
        <div class="marca-panel__top">
          <div class="logo">GC</div>
          <span class="eyebrow" style="color:#9db3a4;">Grupo Cresta</span>
        </div>
        <div class="marca-panel__msg">
          <h1>Gobierno de datos</h1>
          <p>Métricas certificadas, acceso controlado y trazabilidad para toda la operación
             avícola del grupo.</p>
        </div>
        <ul class="marca-panel__lista">
          <li>Definiciones únicas por métrica</li>
          <li>Certificación con múltiples aprobadores</li>
          <li>Cada cambio queda auditado</li>
        </ul>
      </section>

      <section class="form-panel">
        <form class="acceso-form" (ngSubmit)="entrar()">
          <span class="eyebrow">Plano de control</span>
          <h2>Iniciar sesión</h2>
          <p class="sub">Ingresa con tu cuenta del portal.</p>

          <div class="campo">
            <label for="email">Email</label>
            <input id="email" type="email" name="email" [(ngModel)]="email" required autocomplete="username" />
          </div>
          <div class="campo">
            <label for="password">Contraseña</label>
            <input id="password" type="password" name="password" [(ngModel)]="password" required autocomplete="current-password" />
          </div>
          @if (error()) { <p class="error">{{ error() }}</p> }
          <button type="submit" style="width:100%; margin-top:6px;" [disabled]="cargando()">
            {{ cargando() ? 'Verificando…' : 'Entrar' }}
          </button>
        </form>
      </section>
    </div>
  `,
  styles: [`
    .acceso { display: grid; grid-template-columns: 1.05fr 1fr; min-height: 100vh; }
    .marca-panel {
      background: linear-gradient(160deg, var(--brand-800), var(--brand-900));
      color: #dfe8e0; padding: 44px; display: flex; flex-direction: column; justify-content: space-between;
    }
    .marca-panel__top { display: flex; align-items: center; gap: 12px; }
    .logo {
      width: 44px; height: 44px; border-radius: 10px; background: var(--amber-500);
      color: var(--brand-900); display: grid; place-items: center; font-weight: 700; font-size: 17px;
    }
    .marca-panel__msg h1 { color: #fff; font-size: 34px; line-height: 1.1; margin-bottom: 14px; }
    .marca-panel__msg p { color: #a9bdae; font-size: 15px; max-width: 30ch; }
    .marca-panel__lista { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
    .marca-panel__lista li { position: relative; padding-left: 22px; font-size: 13.5px; color: #c4d3c8; }
    .marca-panel__lista li::before {
      content: ""; position: absolute; left: 0; top: 6px; width: 8px; height: 8px;
      border-radius: 50%; background: var(--amber-500);
    }
    .form-panel { display: grid; place-items: center; padding: 32px; background: var(--bg); }
    .acceso-form { width: 100%; max-width: 340px; }
    .acceso-form h2 { margin: 6px 0 4px; }
    .acceso-form .sub { color: var(--muted); font-size: 13.5px; margin: 0 0 22px; }
    @media (max-width: 760px) {
      .acceso { grid-template-columns: 1fr; }
      .marca-panel { display: none; }
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
