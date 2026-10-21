/**
 * Errores de la base de datos y de Supabase Auth → mensajes para la persona.
 * Las funciones de la BD lanzan `message = 'AMO_*'` con un `detail` ya escrito
 * para la interfaz (docs/modelo-datos.md §1.7); se usa ese detalle cuando
 * existe. Nunca se muestran mensajes técnicos crudos.
 */

export interface ErrorBd {
  code?: string | null
  message?: string | null
  details?: string | null
}

export interface ErrorAuth {
  code?: string | null
  status?: number | null
}

export const MENSAJE_INESPERADO =
  "No pudimos completar la operación. Intenta de nuevo en unos minutos."

const MENSAJES_NEGOCIO: Readonly<Record<string, string>> = {
  AMO_NO_AUTORIZADO:
    "No tienes permiso para esta acción o tu sesión ya no es válida. Vuelve a ingresar si el problema continúa.",
  AMO_ESCALADA_PERMISOS:
    "No puedes gestionar a un usuario con permisos que tú no tienes.",
  AMO_ROL_PROPIO: "No puedes cambiar tu propio rol.",
  AMO_SOLO_SUPERADMIN:
    "Solo un superadministrador puede asignar o quitar ese rol.",
  AMO_ULTIMO_SUPERADMIN: "Debe quedar al menos un superadministrador activo.",
  AMO_TRANSICION_INVALIDA:
    "La cuenta no puede pasar a ese estado desde el actual. Actualiza la página.",
  AMO_MOTIVO_REQUERIDO: "Indica el motivo del cambio.",
  AMO_ROL_SISTEMA: "Los roles de sistema no se pueden modificar.",
}

const RESTRICCIONES: Readonly<Record<string, string>> = {
  perfiles_rol_organizacion_chk:
    "Un usuario activo necesita la organización que exige su rol.",
  perfiles_email_key: "Ya existe una cuenta con ese correo.",
  perfiles_celular_chk: "El celular no tiene un formato válido.",
}

/** Código de negocio (`AMO_*`) de un error de la BD, si lo es. */
export function codigoNegocio(error: ErrorBd): string | null {
  return error.message?.startsWith("AMO_") ? error.message : null
}

export function mensajeErrorBd(error: ErrorBd): string {
  const codigo = codigoNegocio(error)
  if (codigo) {
    return (
      error.details?.trim() || MENSAJES_NEGOCIO[codigo] || MENSAJE_INESPERADO
    )
  }
  const restriccion = Object.keys(RESTRICCIONES).find(
    (nombre) =>
      error.message?.includes(nombre) || error.details?.includes(nombre)
  )
  return restriccion ? RESTRICCIONES[restriccion] : MENSAJE_INESPERADO
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
