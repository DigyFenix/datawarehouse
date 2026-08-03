/** Config de entorno del frontend. En Docker, nginx hace proxy de /api al backend. */
export const environment = {
  produccion: true,
  apiUrl: '/api',
  // Base del PORTAL DE USUARIO: la URL de ingreso de cada tenant es <base>/<hash_tenant>.
  // En dev es el web-usuario del compose local; en producción, el dominio del portal.
  portalUsuarioUrl: 'http://localhost:8081',
};
