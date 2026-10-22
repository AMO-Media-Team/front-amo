/**
 * Errores de Supabase Auth → mensajes para la persona. Los de la base de datos
 * viven en `@/lib/errores-bd`; se re-exportan aquí para no romper a quien ya
 * los importa desde este módulo.
 */
import { MENSAJE_INESPERADO } from "@/lib/errores-bd"

export {
  codigoNegocio,
  type ErrorBd,
  MENSAJE_INESPERADO,
  mensajeErrorBd,
} from "@/lib/errores-bd"

export interface ErrorAuth {
  code?: string | null
  status?: number | null
}

const CODIGOS_CORREO_EXISTENTE = new Set([
  "email_exists",
  "user_already_exists",
])

export function esCorreoExistente(error: ErrorAuth): boolean {
  return CODIGOS_CORREO_EXISTENTE.has(error.code ?? "")
}

export function mensajeErrorAuth(error: ErrorAuth): string {
  if (esCorreoExistente(error)) return "Ya existe una cuenta con ese correo."
  if (error.status === 429 || error.code === "over_request_rate_limit") {
    return "Demasiadas solicitudes seguidas. Espera un minuto e intenta de nuevo."
  }
  if (error.code === "weak_password") {
    return "Supabase rechazó la contraseña temporal por débil. Intenta de nuevo."
  }
  return MENSAJE_INESPERADO
}
