/**
 * Cómo devolver un perfil a ACTIVO sin escribir `perfiles.estado` (módulo
 * puro). Desde la migración 7 el estado solo cambia por transición
 * (docs/modelo-datos.md §4.2): `activar_perfil_srv` lleva INVITADO → ACTIVO
 * (actor SISTEMA, correo confirmado) y `transicionar_srv` aplica las demás,
 * con un actor humano en sesión aal2 y motivo.
 */
import type { Database } from "../../src/types/database.types"

export type EstadoPerfil = Database["public"]["Enums"]["perfil_estado"]

export type DestinoRestauracion = Extract<EstadoPerfil, "ACTIVO" | "INVITADO">

/**
 * Transiciones que `transicionar_srv` debe aplicar, en orden, antes de
 * `activar_perfil_srv`. Una cuenta desactivada vuelve a INVITADO (que limpia
 * la baja y exige cambiar la contraseña) y de ahí la activa el sistema.
 */
export function transicionesParaRestaurar(
  estado: EstadoPerfil
): readonly DestinoRestauracion[] {
  switch (estado) {
    case "SUSPENDIDO":
      return ["ACTIVO"]
    case "DESACTIVADO":
      return ["INVITADO"]
    case "INVITADO":
    case "ACTIVO":
      return []
  }
}

/** ¿Hace falta un actor humano (transicionar_srv) para volver a ACTIVO? */
export function requiereTransicionHumana(estado: EstadoPerfil): boolean {
  return transicionesParaRestaurar(estado).length > 0
}
