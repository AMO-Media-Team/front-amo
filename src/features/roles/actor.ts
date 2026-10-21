/**
 * DTO del actor para la interfaz de Roles: id, rol, permisos y qué secciones
 * puede ver o gestionar. Nada más sale al cliente. Módulo puro.
 */
import { tieneAlgunPermiso } from "@/lib/auth/autorizacion"
import type { UsuarioSesion } from "@/lib/auth/tipos"

import type { ActorRoles } from "./tipos"

export function actorParaRoles(
  usuario: Pick<UsuarioSesion, "id" | "rol" | "permisos">
): ActorRoles {
  return {
    id: usuario.id,
    rolId: usuario.rol.id,
    esSuperadmin: usuario.rol.clave === "SUPERADMIN",
    permisos: usuario.permisos,
    puedeGestionar: tieneAlgunPermiso(usuario, ["roles.gestionar"]),
    puedeVerUsuarios: tieneAlgunPermiso(usuario, ["usuarios.ver"]),
    puedeVerAuditoria: tieneAlgunPermiso(usuario, ["auditoria.ver"]),
  }
}
