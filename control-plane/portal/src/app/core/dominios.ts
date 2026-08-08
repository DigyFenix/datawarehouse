/**
 * Nombres de negocio de los dominios del almacén.
 *
 * En la base viven como clave técnica (`cartera_cobrar`, `tesoreria`) porque son
 * estables y se consultan; al usuario hay que mostrarle la frase, con sus tildes.
 * El formateo genérico es sólo la red de seguridad: un dominio nuevo se lee
 * aceptablemente aunque nadie lo haya traducido todavía.
 */
const NOMBRES: Record<string, string> = {
  ventas: 'Ventas',
  compras: 'Compras',
  tesoreria: 'Tesorería',
  rentabilidad: 'Rentabilidad',
  inventario: 'Inventario',
  pedidos: 'Pedidos',
  gobierno: 'Gobierno del dato',
  contabilidad: 'Contabilidad',
  cartera_cobrar: 'Cartera por cobrar',
  cartera_pagar: 'Cartera por pagar',
  pagos: 'Pagos',
  productos: 'Productos',
  socios: 'Socios de negocio',
  tipos_cambio: 'Tipos de cambio',
  datos_maestros: 'Datos maestros',
};

export function nombreDominio(clave: string): string {
  const conocido = NOMBRES[clave];
  if (conocido) return conocido;
  const texto = clave.replace(/_/g, ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
