import "server-only"

import {
  type AdaptadorCorreo,
  enviado,
  fallido,
  type MensajeCorreo,
  reintentar,
  type ResultadoEnvio,
} from "./tipos"

/**
 * Adaptador de Resend por su API HTTP (sin SDK). La cabecera
 * `Idempotency-Key` es la misma en cada reintento del mismo correo: si un
 * intento anterior llegó al proveedor pero su respuesta se perdió, Resend no
 * lo vuelve a enviar (guarda la clave 24 h; los reintentos de la cola caben
 * en unas 2,6 h).
 *
 * Correspondencia: 2xx → enviado; 429, 5xx, red o tiempo agotado →
 * reintentar (429 además pausa la corrida); otro 4xx → fallido. El error que
 * se guarda es un código (`resend_422_validation_error`), nunca el texto del
 * proveedor, que puede citar la dirección del destinatario.
 */

export const URL_API_RESEND = "https://api.resend.com/emails"
export const TIEMPO_MAXIMO_ENVIO_MS = 10_000

const LONGITUD_MAXIMA_ID = 120
const NOMBRE_ERROR = /^[a-z_]{1,60}$/

interface OpcionesResend {
  apiKey: string
  remitente: string
  /** Inyectable en pruebas. */
  hacerFetch?: typeof fetch
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
}

async function leerJson(respuesta: Response): Promise<unknown> {
  try {
    return await respuesta.json()
  } catch {
    return null
  }
}

function idProveedor(cuerpo: unknown): string | null {
  const id = esObjeto(cuerpo) ? cuerpo.id : null
  return typeof id === "string" && id.length > 0
    ? id.slice(0, LONGITUD_MAXIMA_ID)
    : null
}

/** `name` de Resend (`validation_error`, `rate_limit_exceeded`…), si es seguro guardarlo. */
function nombreError(cuerpo: unknown): string | null {
  const nombre = esObjeto(cuerpo) ? cuerpo.name : null
  return typeof nombre === "string" && NOMBRE_ERROR.test(nombre) ? nombre : null
}

function codigoError(estado: number, cuerpo: unknown): string {
  const nombre = nombreError(cuerpo)
  return nombre ? `resend_${estado}_${nombre}` : `resend_${estado}`
}

function esTiempoAgotado(error: unknown): boolean {
  return (
    esObjeto(error) &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  )
}

/** Respuesta HTTP de Resend → resultado del envío. */
export async function interpretarRespuestaResend(
  respuesta: Response
): Promise<ResultadoEnvio> {
  const cuerpo = await leerJson(respuesta)
  if (respuesta.ok) return enviado(idProveedor(cuerpo))
  const error = codigoError(respuesta.status, cuerpo)
  if (respuesta.status === 429) return reintentar(error, true)
  if (respuesta.status >= 500) return reintentar(error)
  // Otro proceso envía ahora mismo con la misma clave: se reintenta luego.
  if (
    respuesta.status === 409 &&
    nombreError(cuerpo) === "concurrent_idempotent_requests"
  ) {
    return reintentar(error)
  }
  return fallido(error)
}

export function crearAdaptadorResend({
  apiKey,
  remitente,
  hacerFetch = fetch,
}: OpcionesResend): AdaptadorCorreo {
  return {
    nombre: "resend",
    async enviar(mensaje: MensajeCorreo): Promise<ResultadoEnvio> {
      let respuesta: Response
      try {
        respuesta = await hacerFetch(URL_API_RESEND, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": mensaje.claveIdempotencia,
          },
          body: JSON.stringify({
            from: remitente,
            to: [mensaje.para],
            subject: mensaje.asunto,
            html: mensaje.html,
            text: mensaje.texto,
          }),
          signal: AbortSignal.timeout(TIEMPO_MAXIMO_ENVIO_MS),
        })
      } catch (error) {
        return reintentar(esTiempoAgotado(error) ? "tiempo_agotado" : "red")
      }
      try {
        return await interpretarRespuestaResend(respuesta)
      } catch (error) {
        return reintentar(esTiempoAgotado(error) ? "tiempo_agotado" : "red")
      }
    },
  }
}
