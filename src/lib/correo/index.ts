import "server-only"

import { getEnvServidor } from "@/lib/env.server"

import { crearAdaptadorRegistro } from "./registro"
import { crearAdaptadorResend } from "./resend"
import type { AdaptadorCorreo } from "./tipos"

export type { AdaptadorCorreo, MensajeCorreo, ResultadoEnvio } from "./tipos"

/**
 * Adaptador según `AMO_CORREO_PROVEEDOR`; `null` con el correo desactivado
 * (el despachador responde sin reclamar nada). El esquema de entorno ya exige
 * la clave y el remitente con `resend`.
 */
export function obtenerAdaptadorCorreo(): AdaptadorCorreo | null {
  const env = getEnvServidor()
  switch (env.AMO_CORREO_PROVEEDOR) {
    case "registro":
      return crearAdaptadorRegistro()
    case "resend":
      return env.RESEND_API_KEY && env.AMO_CORREO_REMITENTE
        ? crearAdaptadorResend({
            apiKey: env.RESEND_API_KEY,
            remitente: env.AMO_CORREO_REMITENTE,
          })
        : null
    case "desactivado":
      return null
  }
}
