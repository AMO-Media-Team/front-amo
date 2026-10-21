/**
 * DTO del módulo de Roles y permisos: lo mínimo que la interfaz necesita.
 * `type` y no `interface`: se serializan de Server a Client Components.
 */
import type { ClavePermiso } from "@/lib/auth/permisos"
import type { Database } from "@/types/database.types"

export type TipoRol = Database["public"]["Enums"]["rol_tipo"]
export type EstadoPerfil = Database["public"]["Enums"]["perfil_estado"]

export type RolListado = {
  id: string
  clave: string
  nombre: string
  descripcion: string | null
  tipo: TipoRol
  esSistema: boolean
  requiereMfa: boolean
  color: string
  /** Permisos del rol, en el orden del catálogo (solo claves conocidas). */
  permisos: ClavePermiso[]
  /**
   * Cuentas vigentes con el rol (sin las desactivadas). `null` si el actor no
   * tiene `usuarios.ver`: la RLS de `perfiles` no le deja contarlas.
   */
  usuarios: number | null
  /** Cualquier perfil que lo referencie (también desactivados): impide borrarlo. */
  asignados: number | null
}

export type RolDetalle = RolListado & {
  creadoAt: string
  actualizadoAt: string
}

/** Rol que se puede elegir como origen al duplicar o crear "desde". */
export type RolOrigen = Pick<
  RolListado,
  "id" | "nombre" | "clave" | "tipo" | "color" | "esSistema" | "permisos"
>

/** Quién actúa, tal como lo necesita la interfaz para decidir qué ofrecer. */
export type ActorRoles = {
  id: string
  rolId: string
  esSuperadmin: boolean
  permisos: readonly ClavePermiso[]
  puedeGestionar: boolean
  puedeVerUsuarios: boolean
  puedeVerAuditoria: boolean
}

export type UsuarioDelRol = {
  id: string
  nombre: string | null
  email: string
  estado: EstadoPerfil
  mfaActivo: boolean
  ultimoAccesoAt: string | null
}

export type UsuariosDelRol = {
  usuarios: UsuarioDelRol[]
  total: number
}

/** Fila de `bitacora` sobre `roles` o `rol_permisos` de un rol. */
export type EventoBitacoraRol = {
  id: number
  at: string
  accion: string
  entidad: string
  actorId: string | null
  actorEmail: string | null
  actorRol: string | null
  cambios: Record<string, unknown>
  origen: string
}
