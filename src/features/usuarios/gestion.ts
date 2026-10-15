import "server-only"

import { tieneAlgunPermiso } from "@/lib/auth/dal"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { getEnvServidor } from "@/lib/env.server"

import type { DatosGestionUsuarios } from "./components/contexto-gestion"
import { organizaciones, rolesAsignables } from "./queries"
import type { ActorUsuarios } from "./tipos"

const SIN_ORGANIZACIONES = { anunciantes: [], medios: [] }

const PERMISOS_GESTION = [
  "usuarios.invitar",
  "usuarios.editar",
  "usuarios.suspender",
  "usuarios.cerrar_sesiones",
  "usuarios.generar_enlace",
  "usuarios.eliminar",
] as const

/** DTO del actor para la interfaz: id, si es SUPERADMIN y sus permisos (nada más). */
export function actorParaInterfaz(usuario: UsuarioSesion): ActorUsuarios {
  return {
    id: usuario.id,
    esSuperadmin: usuario.rol.clave === "SUPERADMIN",
    permisos: usuario.permisos,
  }
}

/**
 * Datos que necesitan los formularios y menús de acciones. Sin permisos de
 * gestión no se consulta nada (los menús quedan vacíos); las organizaciones
 * solo hacen falta para crear o editar.
 */
export async function cargarDatosGestion(
  usuario: UsuarioSesion
): Promise<DatosGestionUsuarios> {
  const gestiona = tieneAlgunPermiso(usuario, PERMISOS_GESTION)
  const edita = tieneAlgunPermiso(usuario, [
    "usuarios.invitar",
    "usuarios.editar",
  ])
  const [roles, orgs] = await Promise.all([
    gestiona ? rolesAsignables() : [],
    edita ? organizaciones() : SIN_ORGANIZACIONES,
  ])
  return {
    actor: actorParaInterfaz(usuario),
    rolesAsignables: roles,
    organizaciones: orgs,
    smtpConfigurado: getEnvServidor().AMO_SMTP_CONFIGURADO,
  }
}
