import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { TenantService } from '../../core/tenant.service';

/**
 * Canjea el pase de soporte que emitió el portal de administración y entra al
 * portal como el usuario indicado.
 *
 * Es una pantalla de paso: no pide nada porque la autorización ya la dio el pase,
 * que es de un solo uso y caduca en dos minutos. Si falla, se dice por qué y se
 * ofrece el login normal — nunca se deja al operador en una pantalla muda.
 */
@Component({
  selector: 'app-entrar-como',
  standalone: true,
  template: `
    <div class="panel">
      <div class="tarjeta caja">
        @if (error()) {
          <span class="eyebrow">Acceso de soporte</span>
          <h2>No se pudo entrar</h2>
          <p>{{ error() }}</p>
          <p class="pista">
            Los pases duran dos minutos y sirven una sola vez. Genera uno nuevo desde el
            portal de administración.
          </p>
          <button (click)="irALogin()">Ir al inicio de sesión</button>
        } @else {
          <span class="eyebrow">Acceso de soporte</span>
          <h2>Entrando…</h2>
          <p>Abriendo el portal tal como lo ve el usuario.</p>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .panel {
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: var(--bg);
        padding: var(--sp-6);
      }
      .caja {
        max-width: 420px;
        text-align: center;
        padding: 44px 32px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
      }
      h2 {
        margin: 2px 0 4px;
      }
      p {
        margin: 0;
        font-size: 13.5px;
        line-height: 1.6;
        color: var(--faint);
      }
      .pista {
        font-size: 12.5px;
      }
      button {
        margin-top: 14px;
      }
    `,
  ],
})
export class EntrarComoComponent implements OnInit {
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly tenant = inject(TenantService);

  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const ticket = this.ruta.snapshot.queryParamMap.get('pase');
    if (!ticket) {
      this.error.set('Falta el pase de acceso en la dirección.');
      return;
    }
    this.auth.entrarComo(ticket).subscribe({
      next: () => void this.router.navigate(['/', this.tenant.exigirHash(), 'inicio']),
      error: (e: Error) => this.error.set(e.message),
    });
  }

  irALogin(): void {
    void this.router.navigate(['/', this.tenant.exigirHash(), 'login']);
  }
}
