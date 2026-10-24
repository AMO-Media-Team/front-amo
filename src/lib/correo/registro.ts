import "server-only"

import {
  type AdaptadorCorreo,
  enviado,
  type MensajeCorreo,
  type ResultadoEnvio,
} from "./tipos"

/**
 * Adaptador de local y develop: recorre la cola completa (reclamo, armado y
 * registro del envío) sin enviar nada. No escribe destinatario, asunto ni
 * contenido en el log: solo la clave de idempotencia, que no identifica a
 * nadie. El esquema de entorno lo prohíbe en producción.
 */
export function crearAdaptadorRegistro(): AdaptadorCorreo {
  return {
    nombre: "registro",
    async enviar(mensaje: MensajeCorreo): Promise<ResultadoEnvio> {
      console.info(
        JSON.stringify({
          nivel: "info",
          evento: "correo_simulado",
          clave: mensaje.claveIdempotencia,
        })
      )
      return enviado(`registro:${mensaje.claveIdempotencia}`)
    },
  }
}
