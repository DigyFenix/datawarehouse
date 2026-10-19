import { TableroResumen } from './modelos';

export interface GrupoTableros {
  /** null = tableros sin grupo (se listan al final, sin encabezado propio si son los únicos). */
  grupo: string | null;
  tableros: TableroResumen[];
}

/**
 * Agrupa los tableros por familia conservando el `orden` que puso el admin: el
 * grupo aparece donde aparece su primer tablero; los sin grupo van al final.
 */
export function agruparTableros(lista: TableroResumen[]): GrupoTableros[] {
  const grupos = new Map<string | null, TableroResumen[]>();
  for (const t of lista) {
    const clave = t.grupo?.trim() || null;
    const actual = grupos.get(clave);
    if (actual) actual.push(t);
    else grupos.set(clave, [t]);
  }
  const resultado = [...grupos.entries()].map(([grupo, tableros]) => ({ grupo, tableros }));
  return [...resultado.filter((g) => g.grupo !== null), ...resultado.filter((g) => g.grupo === null)];
}
