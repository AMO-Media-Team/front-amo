import { obtenerAdaptadorCorreo } from "@/lib/correo"
import { despachadorAutorizado } from "@/lib/correo/autorizacion"
import { ErrorColaCorreos, procesarColaCorreos } from "@/lib/correo/procesar"
import { getEnvServidor } from "@/lib/env.server"

/**
 * POST /api/correos/procesar — despachador de la cola de correos (NOT-004).
 *
 * No tiene sesión: lo llama cada minuto el job `amo_correos` de Postgres
 * (`net.http_post` con `Authorization: Bearer <amo_correos_secreto>`), y solo
 * cuando hay correos por enviar. Por eso es ruta pública del proxy y se
 * autoriza aquí con un secreto propio (`AMO_CORREOS_SECRETO`), comparado en
 * tiempo constante.
 *
 * - Sin secreto configurado responde 404: la ruta no existe en ese entorno.
 * - Con el proveedor `desactivado` responde 204 sin reclamar nada.
 * - Devuelve solo conteos y no escribe correos, asuntos ni nombres en el log.
 */

export const maxDuration = 60

const SIN_CACHE = { "Cache-Control": "no-store" } as const

function codigoDe(error: unknown): string {
  if (error instanceof ErrorColaCorreos) {
    return `${error.operacion}:${error.codigo}`
  }
  return error instanceof Error ? error.name : "desconocido"
}

export async function POST(request: Request): Promise<Response> {
  const { AMO_CORREOS_SECRETO } = getEnvServidor()
  if (!AMO_CORREOS_SECRETO) {
    return new Response(null, { status: 404, headers: SIN_CACHE })
  }
  const cabecera = request.headers.get("authorization")
  if (!despachadorAutorizado(cabecera, AMO_CORREOS_SECRETO)) {
    return new Response(null, {
      status: 401,
      headers: { ...SIN_CACHE, "WWW-Authenticate": "Bearer" },
    })
  }

  const adaptador = obtenerAdaptadorCorreo()
  if (!adaptador) return new Response(null, { status: 204, headers: SIN_CACHE })

  try {
    const resumen = await procesarColaCorreos({ adaptador })
    if (resumen.reclamados > 0) {
      console.info(
        JSON.stringify({
          nivel: "info",
          evento: "correos_procesados",
          proveedor: adaptador.nombre,
          ...resumen,
        })
      )
    }
    return Response.json(resumen, { headers: SIN_CACHE })
  } catch (error) {
    console.error(
      JSON.stringify({
        nivel: "error",
        evento: "correos_fallo",
        codigo: codigoDe(error),
      })
    )
    return Response.json(
      { error: "No se pudo procesar la cola de correos." },
      { status: 503, headers: SIN_CACHE }
    )
  }
}
