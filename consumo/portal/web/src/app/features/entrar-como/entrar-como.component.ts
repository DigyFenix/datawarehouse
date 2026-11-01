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
    // En carga fría nadie activó todavía el tenant: sin esto `exigirHash()` lanzaba y la
    // pantalla quedaba para siempre en «Entrando…» (auditoría §3).
    const hash = this.ruta.snapshot.paramMap.get('hash');
    if (!hash) {
      this.error.set('La dirección no indica la organización.');
      return;
    }
    // El pase viaja en el fragmento (#pase=…): no llega al servidor ni a sus logs ni al Referer.
    // `?pase=` se acepta por compatibilidad con enlaces emitidos antes del cambio.
    const fragmento = new URLSearchParams(this.ruta.snapshot.fragment ?? '');
    const ticket = fragmento.get('pase') ?? this.ruta.snapshot.queryParamMap.get('pase');
    // Se borra de la barra de direcciones: el pase es de un solo uso y no debe quedar en el historial.
    history.replaceState(history.state, '', location.pathname);
    if (!ticket) {
      this.error.set('Falta el pase de acceso en la dirección.');
      return;
    }
    this.tenant.activar(hash).subscribe({
      next: () => {
        this.auth.entrarComo(ticket).subscribe({
          next: () => void this.router.navigate(['/', hash, 'inicio']),
          error: (e: Error) => this.error.set(e.message),
        });
      },
      error: () => this.error.set('Esta dirección de acceso no es válida.'),
    });
  }

  irALogin(): void {
    const hash = this.ruta.snapshot.paramMap.get('hash');
    void this.router.navigate(hash ? ['/', hash, 'login'] : ['/']);
  }
}
