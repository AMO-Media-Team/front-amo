/**
 * DTO del módulo de Usuarios: lo mínimo que la interfaz necesita. Nunca llevan
 * secretos (tokens, factores TOTP) ni datos de `perfiles_privado`.
 */
import type { Database } from "@/types/database.types"

export type EstadoPerfil = Database["public"]["Enums"]["perfil_estado"]
export type TipoRol = Database["public"]["Enums"]["rol_tipo"]

export type RolResumen = {
  id: string
  clave: string
  nombre: string
  color: string
  tipo: TipoRol
}

export type RolVisible = RolResumen & { requiereMfa: boolean }

export type RolAsignable = RolVisible & { descripcion: string | null }

/** Fila del listado (`listar_usuarios`). `type` y no `interface`: TanStack lo exige. */
export type UsuarioFila = {
  id: string
  nombre: string | null
  email: string
  estado: EstadoPerfil
  rol: RolResumen | null
  mfaActivo: boolean
  ultimoAccesoAt: string | null
  invitadoAt: string | null
  creadoAt: string
}

export type PaginaUsuarios = {
  filas: UsuarioFila[]
  total: number
}

export type ResumenUsuarios = {
  total: number
  activos: number
  invitados: number
  suspendidos: number
  desactivados: number
  activosConMfa: number
}

export type UsuarioDetalle = UsuarioFila & {
  celular: string | null
  debeCambiarPassword: boolean
  motivoEstado: string | null
  activadoAt: string | null
  suspendidoAt: string | null
  desactivadoAt: string | null
  actualizadoAt: string
  anuncianteId: string | null
  medioId: string | null
  invitadoPor: { id: string; nombre: string | null; email: string } | null
  esDemo: boolean
}

export type SeguridadUsuario = {
  emailConfirmadoAt: string | null
  ultimoIngresoAt: string | null
  bloqueadoHasta: string | null
  invitadoAt: string | null
  factoresMfa: number
  mfaActivadoAt: string | null
  mfaUltimoUsoAt: string | null
  sesionesActivas: number
}

export type SesionUsuario = {
  id: string
  creadaAt: string
  ultimaActividadAt: string | null
  aal: "aal1" | "aal2" | null
  navegador: string | null
  sistemaOperativo: string | null
  dispositivo: string | null
  /** Solo con `accesos.ver`. */
  ip: string | null
}

export type UltimoAcceso = {
  at: string
  paisIso2: string | null
  ciudad: string | null
}

/** Columnas de `perfiles` cuyo valor (no sensible) muestra la línea de tiempo. */
export const CAMPOS_CON_VALOR = ["rol_id", "debe_cambiar_password"] as const
export type CampoConValor = (typeof CAMPOS_CON_VALOR)[number]

export type EventoActividad = {
  id: number
  at: string
  accion: string
  entidad: string
  entidadId: string | null
  actorId: string | null
  actorEmail: string | null
  actorRol: string | null
  estadoAnterior: string | null
  estadoNuevo: string | null
  /** Nombres de las columnas cambiadas (los valores sensibles quedan en Auditoría). */
  camposCambiados: string[]
  /** Antes/después solo de columnas no sensibles que la línea de tiempo describe. */
  valores: Partial<Record<CampoConValor, { antes: unknown; despues: unknown }>>

  metadatos: Record<string, unknown>
  motivo: string | null
  origen: string
}

export type Organizacion = { id: string; nombre: string }

export type Organizaciones = {
  anunciantes: Organizacion[]
  medios: Organizacion[]
}

export type MetodoAlta = "ENLACE" | "CONTRASENA"

/** Lo que la interfaz muestra UNA sola vez tras crear o regenerar un acceso. */
export type CredencialEntregada =
  | { tipo: "ENLACE"; enlace: string; proposito: "invitacion" | "recuperacion" }
  | { tipo: "CONTRASENA"; contrasena: string }
  | { tipo: "CORREO" }

export type UsuarioCreado = {
  usuarioId: string
  email: string
  credencial: CredencialEntregada
}

/** Actor (usuario en sesión) tal como lo necesita la interfaz para decidir qué ofrecer. */
export type ActorUsuarios = {
  id: string
  esSuperadmin: boolean
  permisos: readonly string[]
}
