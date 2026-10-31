/**
 * DESCARGAS AUTOSERVICIO a Excel: el usuario arma su tabulado por módulo (dominio),
 * métricas, nivel de detalle y período, y el portal lo sirve como .xlsx.
 *
 * El gobierno vive en `@quilate/agente` (`prepararDescarga`): Zod, alcance efectivo,
 * desgloses admitidos, RLS por empresa y SQL constante sobre `oro.metrica_*`. Este
 * servicio solo arma el catálogo para la pantalla y escribe el archivo. Cada libro
 * lleva una hoja «Ficha» con métrica, definición, estado de certificación, período,
 * empresas y frescura: el dato sale del portal con su contexto de gobierno pegado.
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import { prepararDescarga, resolverAlcance, type HojaDescarga, type ResultadoDescarga } from '@quilate/agente';
import ExcelJS from 'exceljs';

import { AgenteService } from '../agente/agente.service';
import { UsuarioPortal } from '../auth/tipos';

export interface MetricaDescargable {
  clave: string;
  nombre: string;
  dominio: string;
  estado: 'certificada' | 'exploratoria';
  definicion: string;
  /** Dimensiones por las que admite desglose (vacío = solo por período). */
  dimensiones: string[];
  periodoDesde: string | null;
  periodoHasta: string | null;
  /** Indicador compuesto por la organización: solo se descarga por mes. */
  derivada: boolean;
}

export interface CatalogoDescargas {
  modulos: { dominio: string; metricas: MetricaDescargable[] }[];
  empresas: { id: string; nombre: string }[];
  frescura: { dominio: string; fechaDatoMasReciente: string | null }[];
  proximaCarga: string | null;
}

export interface ArchivoDescarga {
  nombre: string;
  contenido: Buffer;
  filas: number;
}

const ANCHO_MINIMO = 12;
const ANCHO_MAXIMO = 60;

@Injectable()
export class DescargasService {
  constructor(private readonly agente: AgenteService) {}

  /** Qué puede descargar este usuario: sus métricas autorizadas agrupadas por módulo. */
  async catalogo(usuario: UsuarioPortal): Promise<CatalogoDescargas> {
    const ctx = await this.agente.contextoLectura(usuario);
    const alcance = await resolverAlcance(ctx.ejecutor, usuario.id);
    const porDominio = new Map<string, MetricaDescargable[]>();
    for (const m of alcance.metricas.values()) {
      const dominio = m.dominio || 'otros';
      const lista = porDominio.get(dominio) ?? [];
      lista.push({
        clave: m.clave,
        nombre: m.nombreOficial,
        dominio,
        estado: m.estado,
        definicion: m.definicionNegocio,
        dimensiones: alcance.desglosables.get(m.clave) ?? [],
        periodoDesde: m.periodoDesde,
        periodoHasta: m.periodoHasta,
        derivada: alcance.derivadas.has(m.clave),
      });
      porDominio.set(dominio, lista);
    }
    const modulos = [...porDominio.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dominio, metricas]) => ({ dominio, metricas: metricas.sort((a, b) => a.nombre.localeCompare(b.nombre)) }));
    const empresasAutorizadas = alcance.empresas === '*' ? [...ctx.empresas.keys()] : alcance.empresas;
    return {
      modulos,
      empresas: empresasAutorizadas.filter((id) => ctx.empresas.has(id)).map((id) => ({ id, nombre: ctx.empresas.get(id) ?? id })),
      frescura: ctx.frescura.map((f) => ({ dominio: f.dominio, fechaDatoMasReciente: f.fechaDatoMasReciente })),
      proximaCarga: ctx.proximaCarga?.texto ?? null,
    };
  }

  /** Arma el .xlsx. 400 si la especificación no pasa las guardas (el motivo se le dice al usuario). */
  async excel(usuario: UsuarioPortal, params: unknown, ip: string | null): Promise<ArchivoDescarga> {
    const ctx = await this.agente.contextoLectura(usuario);
    const resultado: ResultadoDescarga = await prepararDescarga({ ejecutor: ctx.ejecutor, usuarioId: usuario.id, empresas: ctx.empresas, params });
    await this.agente.auditarEvento(ctx.pool, usuario, resultado.auditoria, 'descarga', ip);
    if (!resultado.ok) throw new BadRequestException(resultado.motivo ?? 'No se pudo preparar la descarga.');

    const libro = new ExcelJS.Workbook();
    libro.creator = 'Quilate Analytics';
    libro.created = new Date();

    this.hojaFicha(libro, resultado, ctx.frescura, usuario);
    for (const h of resultado.hojas) this.hojaDatos(libro, h);

    const contenido = Buffer.from(await libro.xlsx.writeBuffer());
    const fecha = new Date().toISOString().slice(0, 10);
    const base = resultado.hojas.length === 1 ? resultado.hojas[0]?.metricaClave ?? 'datos' : `${resultado.hojas.length}_metricas`;
    return {
      nombre: `quilate_${base}_${fecha}.xlsx`,
      contenido,
      filas: resultado.hojas.reduce((acc, h) => acc + h.filas.length, 0),
    };
  }

  private hojaFicha(
    libro: ExcelJS.Workbook,
    r: ResultadoDescarga,
    frescura: { dominio: string; fechaDatoMasReciente: string | null }[],
    usuario: UsuarioPortal,
  ): void {
    const hoja = libro.addWorksheet('Ficha', { properties: { tabColor: { argb: 'FF2B4C6F' } } });
    hoja.columns = [{ width: 26 }, { width: 90 }];
    const titulo = hoja.addRow(['Quilate Analytics · descarga gobernada']);
    titulo.font = { bold: true, size: 14, color: { argb: 'FF2B4C6F' } };
    hoja.addRow([]);
    hoja.addRow(['Generado', new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC']);
    hoja.addRow(['Usuario', usuario.email]);
    hoja.addRow(['Empresas incluidas', r.empresas.join(', ') || '—']);
    hoja.addRow([]);
    const cab = hoja.addRow(['Hoja', 'Métrica · estado · período · definición']);
    cab.font = { bold: true };
    for (const h of r.hojas) {
      const fila = hoja.addRow([
        h.nombre,
        `${h.metricaNombre} · ${h.estado === 'certificada' ? 'CERTIFICADA' : 'EXPLORATORIA (no certificada: no usar para decidir)'} · ${h.periodo}${h.truncada ? ' · TRUNCADA al tope de filas, acote el período' : ''}\n${h.definicion}`,
      ]);
      fila.alignment = { wrapText: true, vertical: 'top' };
      if (h.estado === 'exploratoria') fila.getCell(2).font = { color: { argb: 'FF8A5A00' } };
    }
    hoja.addRow([]);
    const f = hoja.addRow(['Frescura del dato', frescura.map((x) => `${x.dominio}: ${x.fechaDatoMasReciente ?? 'sin dato'}`).join(' · ') || '—']);
    f.alignment = { wrapText: true, vertical: 'top' };
    hoja.addRow([
      'Nota',
      'Los valores salen de la capa semántica gobernada (métricas del catálogo, con la definición vigente). Una métrica exploratoria no está certificada.',
    ]).alignment = { wrapText: true, vertical: 'top' };
  }

  private hojaDatos(libro: ExcelJS.Workbook, h: HojaDescarga): void {
    const hoja = libro.addWorksheet(h.nombre, {
      views: [{ state: 'frozen', ySplit: 1 }],
      properties: { tabColor: { argb: h.estado === 'certificada' ? 'FF2A9D6A' : 'FFE0A526' } },
    });
    hoja.columns = h.columnas.map((c) => ({
      header: c.nombre,
      key: c.clave,
      width: Math.min(ANCHO_MAXIMO, Math.max(ANCHO_MINIMO, c.nombre.length + 4)),
      style: c.tipo === 'numero' ? { numFmt: '#,##0.00;[Red]-#,##0.00' } : {},
    }));
    hoja.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hoja.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2B4C6F' } };
    for (const fila of h.filas) {
      const valores: Record<string, string | number | null> = {};
      for (const c of h.columnas) {
        const v = fila[c.clave] ?? null;
        // Un texto que empieza con = + - @ lo evalúa Excel como fórmula: los nombres vienen del
        // ERP y cualquiera puede editarlos allá. Se neutraliza con un apóstrofo (inyección CSV/XLSX).
        valores[c.clave] = typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
      }
      hoja.addRow(valores);
    }
    if (h.filas.length > 0) {
      hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: h.columnas.length } };
      // Totales al pie solo donde sumar tiene sentido (flujos y saldos, no conteos de meses).
      const numericas = h.columnas.filter((c) => c.tipo === 'numero' && c.clave !== 'periodos');
      if (numericas.length) {
        const total: Record<string, string | number> = {};
        const primera = h.columnas[0];
        if (primera) total[primera.clave] = 'Total';
        for (const c of numericas) total[c.clave] = h.filas.reduce((acc, f) => acc + Number(f[c.clave] ?? 0), 0);
        const filaTotal = hoja.addRow(total);
        filaTotal.font = { bold: true };
      }
    }
  }
}
