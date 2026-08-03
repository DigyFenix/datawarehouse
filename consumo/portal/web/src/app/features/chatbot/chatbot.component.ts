import { Component } from '@angular/core';

/**
 * Placeholder del módulo de chatbot (Fase 4 del roadmap: agente gobernado sobre
 * la capa semántica). Los alcances por perfil ya se administran desde hoy en
 * Administración → Perfiles, para no rehacer el modelo de acceso cuando entre.
 */
@Component({
  selector: 'app-chatbot',
  standalone: true,
  template: `
    <div class="page-header">
      <div class="titulo-grupo">
        <span class="eyebrow">Módulos</span>
        <h2>Chatbot</h2>
      </div>
    </div>
    <div class="tarjeta pronto">
      <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
      <h3>Próximamente</h3>
      <p>
        Podrás preguntar en lenguaje natural sobre las métricas certificadas de tu organización
        — ventas, cartera, inventario — y recibir respuestas trazables, limitadas al alcance de
        datos de tu perfil.
      </p>
    </div>
  `,
  styles: [`
    .pronto { max-width: 520px; text-align: center; padding: 48px 32px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
    .pronto svg { color: var(--brand-400); }
    .pronto h3 { margin: 0; }
    .pronto p { margin: 0; color: var(--muted); font-size: 13.5px; }
  `],
})
export class ChatbotComponent {}
