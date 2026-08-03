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
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly tenant = inject(TenantService);
  private readonly _usuario = signal<SesionUsuario | null>(null);

  readonly usuario = this._usuario.asReadonly();
  readonly autenticado = computed(() => this._usuario() !== null);

  /** Restaura la sesión persistida del tenant actual (al entrar por URL). */
  restaurar(): void {
    const raw = localStorage.getItem(this.claveUsuario());
    this._usuario.set(raw ? (JSON.parse(raw) as SesionUsuario) : null);
  }

  login(email: string, password: string): Observable<RespuestaLogin> {
    return this.api.post<RespuestaLogin>('/auth/login', { email, password }).pipe(
      tap((d) => {
        localStorage.setItem(this.claveToken(), d.token);
        localStorage.setItem(this.claveUsuario(), JSON.stringify(d.usuario));
        this._usuario.set(d.usuario);
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
    this._usuario.set(null);
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
}
