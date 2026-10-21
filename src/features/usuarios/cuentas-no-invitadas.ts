/**
 * Cuentas que no nacieron de una invitación de AMO (módulo puro).
 *
 * Toda alta de AMO crea la cuenta en Auth y, en el mismo paso, le fija rol e
 * invitador. Un perfil INVITADO sin rol solo aparece si alguien se registró
 * directamente en Supabase Auth con la clave publicable (mientras los
 * registros públicos estén activos) o si un alta quedó a medias. Quien se
 * registró así eligió la contraseña: si un administrador "adoptara" esa cuenta
 * (le asignara un rol y generara el enlace), al confirmar el correo su dueño
 * real, esa contraseña quedaría válida (pre-secuestro de cuenta). Por eso esas
 * cuentas no se editan ni reciben enlaces: se reemplazan por una invitación.
 */
import type { EstadoPerfil } from "./tipos"

export interface OrigenPerfil {
  estado: EstadoPerfil
  rol_id: string | null
}

export function esCuentaNoInvitada(perfil: OrigenPerfil): boolean {
  return perfil.estado === "INVITADO" && perfil.rol_id === null
}

export const MENSAJE_CUENTA_NO_INVITADA =
  "Esta cuenta no se creó con una invitación de AMO. Créala de nuevo con «Crear usuario» y el mismo correo: la reemplazaremos por una invitación nueva."
