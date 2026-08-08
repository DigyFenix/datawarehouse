/**
 * Sesión del portal de usuario. El token se guarda POR TENANT
 * (portal_token_<hash>): dos organizaciones en el mismo navegador no se pisan.
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { ApiService } from './api.service';
import { SesionUsuario } from './modelos';
import { TenantService } from './tenant.service';

interface RespuestaLogin {
  token: string;
  usuario: SesionUsuario;
  /** Correo del operador que suplanta. Presente ⇒ sesión de solo lectura. */
  impersonadoPor?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly tenant = inject(TenantService);
  private readonly _usuario = signal<SesionUsuario | null>(null);

  private readonly _impersonadoPor = signal<string | null>(null);

  readonly usuario = this._usuario.asReadonly();
  readonly autenticado = computed(() => this._usuario() !== null);
  /** Quién está suplantando esta sesión; null en una sesión normal. */
  readonly impersonadoPor = this._impersonadoPor.asReadonly();

  /** Restaura la sesión persistida del tenant actual (al entrar por URL). */
  restaurar(): void {
    const raw = localStorage.getItem(this.claveUsuario());
    this._usuario.set(raw ? (JSON.parse(raw) as SesionUsuario) : null);
    this._impersonadoPor.set(localStorage.getItem(this.claveImpersonacion()));
  }

  /**
   * Canjea el pase que emitió el portal de administración. La sesión resultante es
   * de solo lectura y el portal lo anuncia con una banda: nunca debe pasar
   * inadvertido que se está viendo la cuenta de otra persona.
   */
  entrarComo(ticket: string): Observable<RespuestaLogin> {
    return this.api.post<RespuestaLogin>('/auth/impersonar', { ticket }).pipe(
      tap((d) => {
        localStorage.setItem(this.claveToken(), d.token);
        localStorage.setItem(this.claveUsuario(), JSON.stringify(d.usuario));
        if (d.impersonadoPor) {
          localStorage.setItem(this.claveImpersonacion(), d.impersonadoPor);
        }
        this._usuario.set(d.usuario);
        this._impersonadoPor.set(d.impersonadoPor ?? null);
      }),
    );
  }

  login(email: string, password: string): Observable<RespuestaLogin> {
    return this.api.post<RespuestaLogin>('/auth/login', { email, password }).pipe(
      tap((d) => {
        localStorage.setItem(this.claveToken(), d.token);
        localStorage.setItem(this.claveUsuario(), JSON.stringify(d.usuario));
        localStorage.removeItem(this.claveImpersonacion());
        this._usuario.set(d.usuario);
        this._impersonadoPor.set(null);
      }),
    );
  }

  cambiarPassword(passwordActual: string, passwordNueva: string): Observable<unknown> {
    return this.api.post('/auth/cambiar-password', { passwordActual, passwordNueva }).pipe(
      tap(() => {
        const usuario = this._usuario();
        if (usuario) {
          const actualizado = { ...usuario, debeCambiarPassword: false };
          localStorage.setItem(this.claveUsuario(), JSON.stringify(actualizado));
          this._usuario.set(actualizado);
        }
      }),
    );
  }

  logout(): void {
    localStorage.removeItem(this.claveToken());
    localStorage.removeItem(this.claveUsuario());
    localStorage.removeItem(this.claveImpersonacion());
    this._usuario.set(null);
    this._impersonadoPor.set(null);
  }

  get token(): string | null {
    try {
      return localStorage.getItem(this.claveToken());
    } catch {
      return null;
    }
  }

  private claveToken(): string {
    return `portal_token_${this.tenant.exigirHash()}`;
  }

  private claveUsuario(): string {
    return `portal_usuario_${this.tenant.exigirHash()}`;
  }

  private claveImpersonacion(): string {
    return `portal_impersonacion_${this.tenant.exigirHash()}`;
  }
}
