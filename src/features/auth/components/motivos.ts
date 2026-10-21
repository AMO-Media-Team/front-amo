/**
 * Avisos de la pantalla de ingreso según `?motivo=` (lo fijan el DAL, el
 * cierre de sesión y los enlaces de correo). Solo se muestran textos de esta
 * lista: el parámetro nunca se refleja tal cual en la página.
 */
export const MENSAJES_MOTIVO = {
  "sesion-cerrada": "Cerraste sesión. ¡Hasta pronto!",
  "sesion-expirada": "Tu sesión expiró. Ingresa de nuevo para continuar.",
  inactividad:
    "Cerramos tu sesión por inactividad para proteger tu cuenta. Ingresa de nuevo para continuar.",
  "cuenta-inactiva":
    "Tu cuenta no está activa. Si crees que es un error, escribe a un administrador de AMO.",
  "enlace-invalido":
    "El enlace no es válido o ya se usó. Pide uno nuevo para continuar.",
  "enlace-vencido": "El enlace venció. Pide uno nuevo para continuar.",
  "contrasena-actualizada":
    "Actualizamos tu contraseña. Ingresa con la nueva para continuar.",
} as const

export type MotivoIngreso = keyof typeof MENSAJES_MOTIVO

export function mensajeDeMotivo(
  motivo: string | string[] | undefined
): string | undefined {
  const valor = Array.isArray(motivo) ? motivo[0] : motivo
  return valor && Object.hasOwn(MENSAJES_MOTIVO, valor)
    ? MENSAJES_MOTIVO[valor as MotivoIngreso]
    : undefined
}
