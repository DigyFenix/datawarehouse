import { Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { environment } from '../../../environments/environment';
import { ApiService } from '../../core/api.service';
import { TableroDetalle, TableroResumen } from '../../core/modelos';
import { TenantService } from '../../core/tenant.service';
import { EmptyComponent } from '../../ui/empty.component';
import { IconComponent } from '../../ui/icon.component';
import { TabsComponent, PestanaTab } from '../../ui/tabs.component';

/**
 * Alto de la barra inferior de Publish to Web (documentado por Microsoft: 56 px).
 * Por defecto se recorta: trae el botón «compartir» y el de «abrir en otra
 * ventana» —los dos muestran el vínculo público— y el enlace a Microsoft. Un
 * tablero que es un reporte de varias páginas la necesitaría para navegar
 * (mostrarBarra); con un tablero por hoja la navegación son las pestañas del
 * grupo y la barra no hace falta.
 */
const BARRA_POWER_BI = 56;

/**
 * Pausa tras el `load` del iframe: Power BI dispara `load` con el armazón vacío
 * y pinta los visuales después. Sin ella se ve un recuadro en blanco.
 */
const PAUSA_PINTADO_MS = 2500;

/**
 * Visor del tablero. La URL de Power BI NUNCA llega al navegador en JSON: el API
 * entrega nuestra ruta /visor con un pase de un solo uso y es el servidor el que
 * redirige a Power BI. Cada apertura queda auditada en el API.
 *
 * Los tableros del mismo grupo (las hojas de un módulo) se muestran como
 * pestañas; cambiar de pestaña pide un pase nuevo para la hoja elegida.
 */
@Component({
  selector: 'app-tablero-visor',
  standalone: true,
  imports: [RouterLink, EmptyComponent, IconComponent, TabsComponent],
  template: `
    <div class="page-header">
      <div class="titulo-grupo">
        <span class="eyebrow">
          <a [routerLink]="['/', tenant.hash()]" class="volver">← Inicio</a>
          @if (tablero()?.grupo; as grupo) { <span class="sep">·</span> {{ grupo }} }
        </span>
        <h2>{{ tablero()?.nombre ?? 'Cargando…' }}</h2>
      </div>
      @if (urlSegura()) {
        <button type="button" class="secundario pequeno" (click)="pantallaCompleta()">
          <app-icon name="pantallaCompleta" [size]="15"></app-icon> Pantalla completa
        </button>
      }
    </div>

    @if (pestanas().length > 1) {
      <app-tabs [items]="pestanas()" [baseRuta]="['/', tenant.hash(), 'tableros']"></app-tabs>
    }

    @if (urlSegura(); as url) {
      <div class="marco" #marco>
        @if (!iframeListo()) {
          <div class="marco__carga" role="status" aria-live="polite">
            <span class="spinner spinner--grande"></span>
            <span>Cargando el tablero…</span>
          </div>
        }
        <iframe
          [src]="url"
          title="Tablero"
          frameborder="0"
          referrerpolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          [style.height]="tablero()?.mostrarBarra ? '100%' : 'calc(100% + ' + barra + 'px)'"
          [class.oculto]="!iframeListo()"
          (load)="alCargar()"
        ></iframe>
      </div>
    } @else if (error()) {
      <div class="tarjeta vacio-caja">
        <app-empty titulo="No se pudo abrir el tablero">{{ error() }}</app-empty>
      </div>
    }
  `,
  styles: [`
    .page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
    .page-header button { display: inline-flex; align-items: center; gap: 6px; }
    .volver { color: var(--muted); text-decoration: none; font-size: 12px; }
    .volver:hover { color: var(--text); }
    .sep { margin: 0 4px; color: var(--muted); }
    app-tabs { display: block; margin-top: var(--sp-3); }
    .marco {
      position: relative;
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--r);
      overflow: hidden; height: calc(100vh - 190px); min-height: 480px;
    }
    .marco:fullscreen { border-radius: 0; border: 0; height: 100vh; }
    iframe { width: 100%; display: block; border: 0; }
    iframe.oculto { visibility: hidden; }
    .marco__carga {
      position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 12px; background: var(--surface); color: var(--muted); font-size: var(--fs-base); z-index: 1;
    }
    .spinner--grande { width: 26px; height: 26px; border-width: 3px; color: var(--brand-600); }
  `],
})
export class TableroVisorComponent {
  private readonly api = inject(ApiService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroyRef = inject(DestroyRef);
  readonly tenant = inject(TenantService);
  private readonly marco = viewChild<ElementRef<HTMLElement>>('marco');

  readonly barra = BARRA_POWER_BI;
  readonly tablero = signal<TableroDetalle | null>(null);
  readonly urlSegura = signal<SafeResourceUrl | null>(null);
  readonly error = signal<string | null>(null);
  readonly iframeListo = signal(false);
  private readonly disponibles = signal<TableroResumen[]>([]);
  /** Sube con cada apertura: la pausa de pintado de una hoja anterior no destapa la nueva. */
  private apertura = 0;

  /** Hojas del mismo grupo que el usuario puede abrir, en el orden del admin. */
  readonly pestanas = computed<PestanaTab[]>(() => {
    const grupo = this.tablero()?.grupo;
    if (!grupo) return [];
    return this.disponibles()
      .filter((t) => t.grupo === grupo)
      .map((t) => ({ etiqueta: t.nombre, segmento: t.clave }));
  });

  constructor() {
    // Para las pestañas. Si falla, el visor sigue funcionando sin ellas.
    this.api.get<TableroResumen[]>('/tableros').subscribe({
      next: (lista) => this.disponibles.set(lista),
      error: () => this.disponibles.set([]),
    });
    // Angular reutiliza el componente al pasar de una pestaña a otra: escuchar la clave, no leerla una vez.
    this.ruta.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((parametros) => {
      const clave = parametros.get('clave');
      if (!clave) {
        this.error.set('Tablero no especificado');
        return;
      }
      this.abrir(clave);
    });
  }

  private abrir(clave: string): void {
    this.apertura++;
    this.error.set(null);
    this.iframeListo.set(false);
    this.urlSegura.set(null);
    this.api.get<TableroDetalle>(`/tableros/${clave}`).subscribe({
      next: (t) => {
        this.tablero.set(t);
        // Ruta propia (mismo origen) con pase de un solo uso; el API la arma, no el usuario.
        this.urlSegura.set(this.sanitizer.bypassSecurityTrustResourceUrl(`${environment.apiUrl}${t.visor}`));
      },
      error: (e: Error) => this.error.set(e.message),
    });
  }

  alCargar(): void {
    const apertura = this.apertura;
    setTimeout(() => {
      if (apertura === this.apertura) this.iframeListo.set(true);
    }, PAUSA_PINTADO_MS);
  }

  /** Pantalla completa del marco propio: conserva el recorte de la barra de Power BI. */
  pantallaCompleta(): void {
    const marco = this.marco()?.nativeElement;
    if (!marco) return;
    marco.requestFullscreen().catch((e: Error) => this.error.set(`No se pudo abrir en pantalla completa: ${e.message}`));
  }
}
