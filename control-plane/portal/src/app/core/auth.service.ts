/** Sesión del portal: login, token y usuario actual. El token se guarda en localStorage. */
import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { map } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { Respuesta, SesionUsuario } from './modelos';

const CLAVE_TOKEN = 'cresta_portal_token';
const CLAVE_USUARIO = 'cresta_portal_usuario';

interface RespuestaLogin {
  token: string;
  usuario: SesionUsuario;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly _usuario = signal<SesionUsuario | null>(this.leerUsuario());

  readonly usuario = this._usuario.asReadonly();
  readonly autenticado = computed(() => this._usuario() !== null);

  login(email: string, password: string): Observable<SesionUsuario> {
    return this.http
      .post<Respuesta<RespuestaLogin>>(`${environment.apiUrl}/auth/login`, { email, password })
      .pipe(
        map((r) => {
          if (!r.success || !r.data) throw new Error(r.error?.mensaje ?? 'Login fallido');
          return r.data;
        }),
        tap((d) => {
          localStorage.setItem(CLAVE_TOKEN, d.token);
          localStorage.setItem(CLAVE_USUARIO, JSON.stringify(d.usuario));
          this._usuario.set(d.usuario);
        }),
        map((d) => d.usuario),
      );
  }

  logout(): void {
    localStorage.removeItem(CLAVE_TOKEN);
    localStorage.removeItem(CLAVE_USUARIO);
    this._usuario.set(null);
  }

  get token(): string | null {
    return localStorage.getItem(CLAVE_TOKEN);
  }

  private leerUsuario(): SesionUsuario | null {
    const raw = localStorage.getItem(CLAVE_USUARIO);
    return raw ? (JSON.parse(raw) as SesionUsuario) : null;
  }
}
