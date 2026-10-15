/**
 * Qué puede hacer el actor con un rol y con cada permiso. Refleja las guardas
 * de la BD (`fn_guardar_roles`, `fn_guardar_rol_permisos`, §5.4) para ofrecer
 * solo lo permitido y explicar por qué; la BD las garantiza igual. Módulo puro.
 */
import {
  CLAVES_PERMISO,
  type ClavePermiso,
  permisosDeRol,
} from "@/lib/auth/permisos"

import type { ActorRoles, RolListado, TipoRol } from "./tipos"

type ActorPermisos = Pick<ActorRoles, "permisos">

// ── Permisos aplicables por tipo de rol ──────────────────────────────────────

/**
 * `private.tiene_permiso` no distingue el tipo del rol: un permiso interno
 * ("Ver todas las campañas", "Ver el listado de usuarios"…) otorgado a un rol
 * de anunciante o de medio le abriría datos de TODA la plataforma. Por eso un
 * rol externo solo admite los permisos de su rol de sistema (los del portal,
 * que la RLS acota a su organización); un rol del equipo interno, todos.
 */
const APLICABLES: Readonly<Record<TipoRol, ReadonlySet<ClavePermiso>>> = {
  ADMIN: new Set(CLAVES_PERMISO),
  ANUNCIANTE: new Set(permisosDeRol("ANUNCIANTE")),
  MEDIO: new Set(permisosDeRol("MEDIO")),
}

export function esAplicable(tipo: TipoRol, clave: ClavePermiso): boolean {
  return APLICABLES[tipo].has(clave)
}

/** Cuántos permisos admite un rol de ese tipo (base de su cobertura). */
export function totalAplicables(tipo: TipoRol): number {
  return APLICABLES[tipo].size
}

/** Permisos de la lista que un rol de ese tipo no admite. */
export function noAplicables(
  tipo: TipoRol,
  claves: readonly ClavePermiso[]
): ClavePermiso[] {
  return claves.filter((clave) => !esAplicable(tipo, clave))
}

/** Anti-escalada: nadie otorga ni retira un permiso que no tiene. */
export function puedeOtorgar(
  actor: ActorPermisos,
  clave: ClavePermiso
): boolean {
  return actor.permisos.includes(clave)
}

/** Permisos de la lista que el actor no tiene (no puede otorgarlos ni retirarlos). */
export function fueraDeAlcance(
  actor: ActorPermisos,
  claves: readonly ClavePermiso[]
): ClavePermiso[] {
  return claves.filter((clave) => !puedeOtorgar(actor, clave))
}

/**
 * Al duplicar o crear "desde" un rol: qué se copia y qué se omite, porque el
 * actor no lo tiene (anti-escalada) o porque el tipo del rol nuevo no lo admite.
 */
export function permisosClonables(
  origen: readonly ClavePermiso[],
  actor: ActorPermisos,
  tipo: TipoRol
): {
  copiables: ClavePermiso[]
  sinAlcance: ClavePermiso[]
  noAplicables: ClavePermiso[]
} {
  const aplicables = origen.filter((clave) => esAplicable(tipo, clave))
  return {
    copiables: aplicables.filter((clave) => puedeOtorgar(actor, clave)),
    sinAlcance: fueraDeAlcance(actor, aplicables),
    noAplicables: noAplicables(tipo, origen),
  }
}

export type MotivoSoloLectura =
  "superadmin" | "sistema" | "sin-permiso" | "propio"

type RolIdentificado = Pick<RolListado, "id" | "clave" | "esSistema">

/** Por qué la matriz de permisos del rol no se puede editar; `null` si se puede. */
export function motivoSoloLectura(
  rol: RolIdentificado,
  actor: Pick<ActorRoles, "rolId" | "puedeGestionar">
): MotivoSoloLectura | null {
  if (rol.clave === "SUPERADMIN") return "superadmin"
  if (rol.esSistema) return "sistema"
  if (!actor.puedeGestionar) return "sin-permiso"
  if (rol.id === actor.rolId) return "propio"
  return null
}

export type AccionesRol = {
  /** Editar datos: todos en un rol personalizado; en uno de sistema, solo descripción y color. */
  editar: boolean
  soloApariencia: boolean
  duplicar: boolean
  eliminar: boolean
  /** Si no se puede eliminar un rol personalizado, el porqué (para el tooltip). */
  motivoNoEliminar: string | null
}

function motivoParaNoEliminar(
  rol: RolListado,
  actor: ActorRoles
): string | null {
  if (rol.id === actor.rolId) return "Es tu propio rol."
  if (rol.asignados && rol.asignados > 0) {
    return rol.asignados === 1
      ? "Tiene 1 usuario asignado: reasígnalo a otro rol antes de eliminarlo."
      : `Tiene ${rol.asignados} usuarios asignados: reasígnalos a otro rol antes de eliminarlo.`
  }
  if (fueraDeAlcance(actor, rol.permisos).length > 0) {
    return "Incluye permisos que tú no tienes: no puedes retirarlos."
  }
  return null
}

export function accionesDisponibles(
  rol: RolListado,
  actor: ActorRoles
): AccionesRol {
  const gestiona = actor.puedeGestionar
  const motivo = rol.esSistema ? null : motivoParaNoEliminar(rol, actor)
  return {
    editar: gestiona,
    soloApariencia: rol.esSistema,
    duplicar: gestiona,
    eliminar: gestiona && !rol.esSistema && motivo === null,
    motivoNoEliminar: gestiona && !rol.esSistema ? motivo : null,
  }
}
