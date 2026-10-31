/**
 * Traduce una expresión cron de 5 campos (minuto hora día-mes mes día-semana) a una
 * frase en español para mostrarla debajo del campo. Cubre los horarios que se usan
 * en los planes de corrida; lo que no reconoce lo declara como «horario personalizado»
 * en vez de inventar una lectura.
 */
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function dosDigitos(n: number): string {
  return n.toString().padStart(2, '0');
}

function listaEs(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

function diasSemana(campo: string): string | null {
  const nombre = (n: number): string | null => (n >= 0 && n <= 7 ? DIAS[n % 7] : null);
  const rango = /^(\d)-(\d)$/.exec(campo);
  if (rango) {
    const a = nombre(Number(rango[1]));
    const b = nombre(Number(rango[2]));
    return a && b ? `de ${a} a ${b}` : null;
  }
  const partes = campo.split(',').map((p) => nombre(Number(p)));
  if (partes.some((p) => p === null)) return null;
  return `los ${listaEs(partes as string[])}`;
}

function horas(minuto: string, hora: string): string | null {
  if (!/^\d{1,2}$/.test(minuto)) return null;
  const m = Number(minuto);
  if (m > 59) return null;
  const hs = hora.split(',');
  if (!hs.every((h) => /^\d{1,2}$/.test(h) && Number(h) <= 23)) return null;
  return `a las ${listaEs(hs.map((h) => `${dosDigitos(Number(h))}:${dosDigitos(m)}`))}`;
}

export function cronEnLenguaje(cron: string): string {
  const campos = cron.trim().split(/\s+/);
  if (campos.length !== 5) return 'Horario no válido: deben ser 5 campos (minuto hora día mes día-semana).';
  const [min, hor, diaMes, mes, diaSem] = campos;

  const cadaMin = /^\*\/(\d+)$/.exec(min);
  if (cadaMin && hor === '*' && diaMes === '*' && mes === '*' && diaSem === '*') {
    return `Cada ${cadaMin[1]} minutos.`;
  }
  const cadaHora = /^\*\/(\d+)$/.exec(hor);
  if (cadaHora && /^\d{1,2}$/.test(min) && diaMes === '*' && mes === '*' && diaSem === '*') {
    return `Cada ${cadaHora[1]} horas, en el minuto ${dosDigitos(Number(min))}.`;
  }
  if (min === '*' && hor === '*') return 'Cada minuto.';

  const momento = horas(min, hor);
  if (!momento || mes !== '*') return 'Horario personalizado: el sistema lo aplicará tal como está escrito.';

  if (diaMes === '*' && diaSem === '*') return `Todos los días ${momento}.`;
  if (diaMes === '*') {
    const dias = diasSemana(diaSem);
    return dias ? `${dias.charAt(0).toUpperCase()}${dias.slice(1)} ${momento}.` : 'Horario personalizado: el sistema lo aplicará tal como está escrito.';
  }
  if (diaSem === '*' && /^\d{1,2}$/.test(diaMes)) return `El día ${Number(diaMes)} de cada mes ${momento}.`;
  return 'Horario personalizado: el sistema lo aplicará tal como está escrito.';
}
