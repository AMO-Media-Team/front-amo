/**
 * Construcción del DTO de sesión y predicados de autorización (módulo puro).
 * La autorización real la aplica la base de datos (RLS); estos predicados
 * deciden qué páginas y acciones se ofrecen y cuándo responder 403.
 */
import type { Database } from "@/types/database.types"

import { type ClavePermiso, esPermisoValido } from "./permisos"
import type {
  NivelAutenticacion,
  RolSesion,
  TipoRol,
  UsuarioSesion,
} from "./tipos"

type EstadoPerfil = Database["public"]["Enums"]["perfil_estado"]

/** Fila de `perfiles` con su rol y los permisos del rol (una sola consulta). */
export interface FilaPerfilSesion {
  id: string
  email: string
  nombre: string | null
  estado: EstadoPerfil
  debe_cambiar_password: boolean
  anunciante_id: string | null
  medio_id: string | null
  deleted_at: string | null
  rol: {
    id: string
    clave: string
    nombre: string
    tipo: TipoRol
    color: string
    requiere_mfa: boolean
    rol_permisos: readonly { permiso_clave: string }[]
  } | null
}

export interface PerfilSesion {
  usuario: Omit<UsuarioSesion, "aal">
  /** ACTIVO, con rol y sin borrar (compuerta 2). */
  activo: boolean
  debeCambiarPassword: boolean
}

function nombreVisible(nombre: string | null, email: string): string {
  const limpio = nombre?.trim()
  if (limpio) return limpio
  return email.split("@")[0] || "Usuario"
}

const SIN_ROL: RolSesion = {
  id: "",
  clave: "",
  nombre: "Sin rol",
  tipo: "ADMIN",
  color: "#8C66EE",
  requiereMfa: true,
}

export function construirPerfilSesion(fila: FilaPerfilSesion): PerfilSesion {
  const rol: RolSesion = fila.rol
    ? {
        id: fila.rol.id,
        clave: fila.rol.clave,
        nombre: fila.rol.nombre,
        tipo: fila.rol.tipo,
        color: fila.rol.color,
        requiereMfa: fila.rol.requiere_mfa,
      }
    : SIN_ROL
  const permisos = (fila.rol?.rol_permisos ?? [])
    .map(({ permiso_clave }) => permiso_clave)
    .filter(esPermisoValido)

  return {
    usuario: {
      id: fila.id,
      email: fila.email,
      nombre: nombreVisible(fila.nombre, fila.email),
      // Las fotos llegan con el bucket `avatares` (migración de Storage).
      avatarUrl: null,
      rol,
      permisos,
      anuncianteId: fila.anunciante_id,
      medioId: fila.medio_id,
    },
    activo:
      fila.estado === "ACTIVO" && fila.deleted_at === null && fila.rol !== null,
    debeCambiarPassword: fila.debe_cambiar_password,
  }
}

export function conNivel(
  perfil: PerfilSesion,
  aal: NivelAutenticacion
): UsuarioSesion {
  return { ...perfil.usuario, aal }
}

/** Basta con tener uno de los permisos. */
export function tieneAlgunPermiso(
  usuario: Pick<UsuarioSesion, "permisos">,
  permisos: readonly ClavePermiso[]
): boolean {
  return permisos.some((permiso) => usuario.permisos.includes(permiso))
}

export function esDeTipoRol(
  usuario: Pick<UsuarioSesion, "rol">,
  tipos: readonly TipoRol[]
): boolean {
  return tipos.includes(usuario.rol.tipo)
}
