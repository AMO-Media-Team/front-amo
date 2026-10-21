import type { Instrumentation } from "next"

type ContextoError = Parameters<Instrumentation.onRequestError>[2]
type SolicitudError = Parameters<Instrumentation.onRequestError>[1]

export interface RegistroErrorSolicitud {
  nivel: "error"
  evento: "error_solicitud"
  ruta: string
  metodo: string
  digest?: string
  tipoError: string
  routeType: ContextoError["routeType"]
  routePath: string
  renderSource?: ContextoError["renderSource"]
}

/** El query string puede traer tokens o correos (p. ej. token_hash): se descarta. */
export function rutaSinConsulta(ruta: string): string {
  const fin = ruta.search(/[?#]/)
  return fin === -1 ? ruta : ruta.slice(0, fin)
}

function extraerDigest(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "digest" in error) {
    return String(error.digest)
  }
  return undefined
}

/**
 * Registro estructurado sin PII: ni mensaje (puede contener datos de la BD),
 * ni cabeceras, ni query string. El `digest` enlaza con lo que ve la persona.
 */
export function construirRegistroError(
  error: unknown,
  solicitud: SolicitudError,
  contexto: ContextoError
): RegistroErrorSolicitud {
  return {
    nivel: "error",
    evento: "error_solicitud",
    ruta: rutaSinConsulta(solicitud.path),
    metodo: solicitud.method,
    digest: extraerDigest(error),
    tipoError: error instanceof Error ? error.name : typeof error,
    routeType: contexto.routeType,
    routePath: contexto.routePath,
    renderSource: contexto.renderSource,
  }
}

export const onRequestError: Instrumentation.onRequestError = (
  error,
  solicitud,
  contexto
) => {
  console.error(
    JSON.stringify(construirRegistroError(error, solicitud, contexto))
  )
}
