/**
 * Menús de acciones (<details class="menu-acciones">) que flotan sobre la página.
 *
 * Viven dentro de tablas con scroll horizontal (.tabla-wrap), y ese overflow recorta
 * cualquier cosa posicionada en absoluto: en la última fila el menú quedaba cortado.
 * Al abrirse, la lista pasa a `position: fixed` con coordenadas calculadas desde el
 * botón, hacia abajo o hacia arriba según el espacio. Se cierra al hacer scroll,
 * al cambiar el tamaño de la ventana o al hacer clic fuera.
 */
const MARGEN = 6;

function cerrarTodos(excepto?: Element): void {
  document.querySelectorAll('details.menu-acciones[open]').forEach((d) => {
    if (d !== excepto) d.removeAttribute('open');
  });
}

function posicionar(menu: HTMLDetailsElement): void {
  const boton = menu.querySelector('summary');
  const lista = menu.querySelector<HTMLElement>('.menu-acciones__lista');
  if (!boton || !lista) return;
  const r = boton.getBoundingClientRect();
  lista.style.position = 'fixed';
  lista.style.right = 'auto';
  lista.style.top = '0px';
  lista.style.left = '0px';
  const alto = lista.offsetHeight;
  const ancho = lista.offsetWidth;
  const cabeAbajo = r.bottom + MARGEN + alto <= window.innerHeight;
  const top = cabeAbajo ? r.bottom + MARGEN : Math.max(MARGEN, r.top - MARGEN - alto);
  const left = Math.max(MARGEN, Math.min(r.right - ancho, window.innerWidth - ancho - MARGEN));
  lista.style.top = `${top}px`;
  lista.style.left = `${left}px`;
}

/** Se instala una vez al arrancar la aplicación. */
export function instalarMenusFlotantes(): void {
  document.addEventListener(
    'toggle',
    (e) => {
      const menu = e.target;
      if (!(menu instanceof HTMLDetailsElement) || !menu.classList.contains('menu-acciones')) return;
      if (menu.open) {
        cerrarTodos(menu);
        posicionar(menu);
      }
    },
    true, // `toggle` no burbujea: se escucha en captura
  );
  document.addEventListener('click', (e) => {
    const dentro = (e.target as Element | null)?.closest('details.menu-acciones');
    cerrarTodos(dentro ?? undefined);
  });
  window.addEventListener('scroll', () => cerrarTodos(), true);
  window.addEventListener('resize', () => cerrarTodos());
}
