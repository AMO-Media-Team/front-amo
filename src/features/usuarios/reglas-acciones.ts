/**
 * Qué acciones ofrecer sobre un usuario (módulo puro). Refleja en la interfaz
 * las guardas que la base de datos garantiza de todos modos (§4.2 y §5.4):
 *
 * - Permiso del catálogo `usuarios.*` para cada acción.
 * - Anti-escalada: solo se gestiona a quien tiene un rol que el actor podría
 *   asignar (`roles_asignables`, misma regla que `private.puede_gestionar`).
 *   Solo un SUPERADMIN actúa sobre otro SUPERADMIN.
 * - Nadie cambia el estado, el rol ni las sesiones de su propia cuenta desde
 *   aquí (para eso existe "Mi cuenta").
 * - Transiciones válidas según el estado actual.
 * - Borrado definitivo: solo SUPERADMIN y solo cuentas ya desactivadas.
 * - Una cuenta que no nació de una invitación de AMO no se edita ni recibe
 *   enlaces (`cuentas-no-invitadas.ts`): se revoca o se crea de nuevo.
 */
import { esCuentaNoInvitada } from "./cuentas-no-invitadas"
import type { ActorUsuarios, EstadoPerfil } from "./tipos"

export const ACCIONES_USUARIO = [
  "editar",
  "suspender",
  "reactivar",
  "restablecer_mfa",
  "forzar_cambio",
  "enlace_invitacion",
  "enlace_recuperacion",
  "cerrar_sesiones",
  "revocar_invitacion",
  "desactivar",
  "eliminar",
] as const

export type AccionUsuario = (typeof ACCIONES_USUARIO)[number]

export interface ObjetivoAcciones {
  id: string
  estado: EstadoPerfil
  rolId: string | null
  mfaActivo: boolean
  /** Desconocido en el listado: la acción se ofrece solo en la ficha. */
  debeCambiarPassword?: boolean
}

type Regla = (contexto: {
  tiene: (permiso: string) => boolean
  objetivo: ObjetivoAcciones
  actor: ActorUsuarios
}) => boolean

const noInvitada = ({ estado, rolId }: ObjetivoAcciones) =>
  esCuentaNoInvitada({ estado, rol_id: rolId })

const REGLAS: Record<AccionUsuario, Regla> = {
  editar: ({ tiene, objetivo }) =>
    tiene("usuarios.editar") && !noInvitada(objetivo),
  // suspender_usuario_srv también cierra sesiones: exige ambos permisos.
  suspender: ({ tiene, objetivo }) =>
    objetivo.estado === "ACTIVO" &&
    tiene("usuarios.suspender") &&
    tiene("usuarios.cerrar_sesiones"),
  reactivar: ({ tiene, objetivo }) =>
    objetivo.estado === "SUSPENDIDO" && tiene("usuarios.suspender"),
  restablecer_mfa: ({ tiene, objetivo }) =>
    objetivo.mfaActivo &&
    objetivo.estado !== "DESACTIVADO" &&
    tiene("usuarios.editar") &&
    tiene("usuarios.cerrar_sesiones"),
  forzar_cambio: ({ tiene, objetivo }) =>
    objetivo.estado === "ACTIVO" &&
    objetivo.debeCambiarPassword === false &&
    tiene("usuarios.editar"),
  enlace_invitacion: ({ tiene, objetivo }) =>
    objetivo.estado === "INVITADO" &&
    tiene("usuarios.invitar") &&
    !noInvitada(objetivo),
  enlace_recuperacion: ({ tiene, objetivo }) =>
    objetivo.estado === "ACTIVO" && tiene("usuarios.generar_enlace"),
  cerrar_sesiones: ({ tiene, objetivo }) =>
    objetivo.estado === "ACTIVO" && tiene("usuarios.cerrar_sesiones"),
  revocar_invitacion: ({ tiene, objetivo }) =>
    objetivo.estado === "INVITADO" && tiene("usuarios.invitar"),
  desactivar: ({ tiene, objetivo }) =>
    (objetivo.estado === "ACTIVO" || objetivo.estado === "SUSPENDIDO") &&
    tiene("usuarios.eliminar"),
  eliminar: ({ tiene, objetivo, actor }) =>
    objetivo.estado === "DESACTIVADO" &&
    actor.esSuperadmin &&
    tiene("usuarios.eliminar"),
}

/** Acciones permitidas sobre la propia cuenta (el resto va por "Mi cuenta"). */
const PERMITIDAS_SOBRE_SI_MISMO: ReadonlySet<AccionUsuario> = new Set([
  "editar",
])

/**
 * @param rolesGestionables ids de `roles_asignables` del actor.
 */
export function accionesDisponibles(
  actor: ActorUsuarios,
  objetivo: ObjetivoAcciones,
  rolesGestionables: ReadonlySet<string>
): ReadonlySet<AccionUsuario> {
  const esPropia = actor.id === objetivo.id
  const gestionable =
    objetivo.rolId === null || rolesGestionables.has(objetivo.rolId)
  if (!gestionable) return new Set()

  const tiene = (permiso: string) => actor.permisos.includes(permiso)
  return new Set(
    ACCIONES_USUARIO.filter(
      (accion) =>
        (!esPropia || PERMITIDAS_SOBRE_SI_MISMO.has(accion)) &&
        REGLAS[accion]({ tiene, objetivo, actor })
    )
  )
}

/** En la edición de la propia cuenta el rol queda bloqueado (AMO_ROL_PROPIO). */
export function puedeCambiarRol(
  actor: ActorUsuarios,
  usuarioId: string
): boolean {
  return actor.id !== usuarioId
}
