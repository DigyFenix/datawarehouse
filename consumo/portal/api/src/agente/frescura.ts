/**
 * Próxima carga programada del warehouse, calculada en la zona horaria del negocio.
 *
 * El programador de producción (infra/produccion/programador.sh) corre la actualización a
 * cada hora de `HORAS_CARGA` ("HH:MM HH:MM"). El portal no puede adelantar esa carga —sería
 * caro y lento para todos—, pero sí debe DECIR cuándo llega: el asistente lo cita cuando
 * piden un dato más reciente que el corte y la pantalla de inicio lo muestra junto a la
 * frescura. Sin horario configurado no se inventa nada: null.
 */

export interface ProximaCarga {
  /** Instante en ISO (UTC). */
  iso: string;
  /** Texto para la gente: «hoy a las 18:00» o «mañana a las 05:00». */
  texto: string;
  /** Minutos que faltan. */
  minutos: number;
}

/** Partes locales (año, mes, día, hora, minuto) de un instante en la zona dada. */
function partesLocales(instante: Date, zona: string): { fecha: string; minutosDelDia: number } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instante);
  const v = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '00';
  return {
    fecha: `${v('year')}-${v('month')}-${v('day')}`,
    minutosDelDia: Number(v('hour')) * 60 + Number(v('minute')),
  };
}

/**
 * @param horas lista "HH:MM HH:MM" (separada por espacios o comas); entradas inválidas se ignoran
 * @param zona  zona IANA del negocio (ZONA_HORARIA)
 * @param ahora instante de referencia (inyectable para pruebas)
 */
export function proximaCarga(horas: string, zona: string, ahora: Date = new Date()): ProximaCarga | null {
  const objetivos = horas
    .split(/[\s,]+/)
    .map((h) => h.trim())
    .filter((h) => /^\d{1,2}:\d{2}$/.test(h))
    .map((h) => {
      const [hh, mm] = h.split(':').map(Number);
      return hh < 24 && mm < 60 ? hh * 60 + mm : null;
    })
    .filter((m): m is number => m !== null);
  if (objetivos.length === 0) return null;

  const { minutosDelDia } = partesLocales(ahora, zona);
  // Minutos hasta la próxima ocurrencia de cada hora (hoy si aún no pasó; si no, mañana).
  const faltas = objetivos.map((obj) => (obj > minutosDelDia ? obj - minutosDelDia : obj + 1440 - minutosDelDia));
  const minutos = Math.min(...faltas);
  const objetivo = objetivos[faltas.indexOf(minutos)];
  const instante = new Date(ahora.getTime() + minutos * 60_000);
  const esHoy = partesLocales(instante, zona).fecha === partesLocales(ahora, zona).fecha;
  const hhmm = `${String(Math.floor(objetivo / 60)).padStart(2, '0')}:${String(objetivo % 60).padStart(2, '0')}`;
  return { iso: instante.toISOString(), texto: `${esHoy ? 'hoy' : 'mañana'} a las ${hhmm}`, minutos };
}
