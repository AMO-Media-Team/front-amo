/**
 * ¿El error impide dibujar el mapa? Los de una fuente o tesela (`sourceId`,
 * `tile`: p. ej. el mapa base sin permiso para el token) no: el coroplético
 * usa su propia fuente y sigue funcionando sin mapa base.
 */
export function esErrorFatalMapa(evento: object): boolean {
  return (
    !("sourceId" in evento && evento.sourceId) &&
    !("tile" in evento && evento.tile)
  )
}

/**
 * Mensaje en español para un error que impide iniciar Mapbox. El texto
 * original (en inglés, con enlaces a la documentación) no llega a la interfaz.
 */
export function mensajeErrorMapa(error: unknown): string {
  const texto =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : ""
  const estado =
    typeof error === "object" && error !== null && "status" in error
      ? Number(error.status)
      : Number.NaN

  if (
    estado === 401 ||
    estado === 403 ||
    /access token|unauthorized|forbidden/i.test(texto)
  ) {
    return "El servicio de mapas rechazó la credencial de AMO (token no válido o sin permiso para este dominio)."
  }
  if (/webgl/i.test(texto)) {
    return "Tu navegador no pudo activar WebGL, que se necesita para dibujar el mapa."
  }
  return "No pudimos conectar con el servicio de mapas. Revisa tu conexión e intenta de nuevo."
}
