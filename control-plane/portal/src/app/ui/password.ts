/**
 * Contraseña temporal legible: 12 caracteres sin 0/O ni 1/l/I, con mayúscula,
 * minúscula, dígito y símbolo garantizados. Misma función que usa el portal de
 * usuario; vive aquí para que las tres pantallas que sembran credenciales
 * (admin del cliente, usuarios del producto) no la copien a mano.
 */
export function generarPassword(): string {
  const grupos = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghjkmnpqrstuvwxyz', '23456789', '!#$%&*+?'];
  const todo = grupos.join('');
  const azar = (alfabeto: string): string => alfabeto[crypto.getRandomValues(new Uint32Array(1))[0] % alfabeto.length];
  const letras = grupos.map(azar);
  while (letras.length < 12) letras.push(azar(todo));
  for (let i = letras.length - 1; i > 0; i -= 1) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [letras[i], letras[j]] = [letras[j], letras[i]];
  }
  return letras.join('');
}
