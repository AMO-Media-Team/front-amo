import "server-only"

import { cache } from "react"

import { crearClienteServidor } from "@/lib/supabase/server"
import type { Database, Json } from "@/types/database.types"

import { permisosValidos } from "./catalogo"
import { ordenarRoles } from "./presentacion"
import type { EventoBitacoraRol, RolDetalle, UsuariosDelRol } from "./tipos"

/**
 * Consultas del módulo de Roles con el cliente del USUARIO (JWT + RLS): la BD
 * decide qué ve cada quien (`roles.ver` para roles y permisos, `usuarios.ver`
 * para contar y listar cuentas, `auditoria.ver` para el historial). Un error
 * se lanza: lo recoge el límite de error de la sección.
 */

function fallar(operacion: string, error: { code?: string | null }): never {
  throw new Error(`No se pudo ${operacion} (${error.code ?? "sin código"}).`)
}

/**
 * Rol + sus permisos + dos conteos de perfiles en UNA consulta: `vigentes`
 * (sin desactivados, filtrado abajo) y `asignados` (todos: la FK impide
 * borrar un rol que alguno referencie).
 */
const CONSULTA_ROL = `
  id, clave, nombre, descripcion, tipo, es_sistema, requiere_mfa, color, created_at, updated_at,
  rol_permisos ( permiso_clave ),
  vigentes:perfiles!perfiles_rol_id_fkey ( count ),
  asignados:perfiles!perfiles_rol_id_fkey ( count )
` as const

type FilaRol = Database["public"]["Tables"]["roles"]["Row"] & {
  rol_permisos: { permiso_clave: string }[]
  vigentes: { count: number }[]
  asignados: { count: number }[]
}

function conteo(filas: { count: number }[]): number {
  return filas[0]?.count ?? 0
}

function aRol(fila: FilaRol, contarUsuarios: boolean): RolDetalle {
  return {
    id: fila.id,
    clave: fila.clave,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    tipo: fila.tipo,
    esSistema: fila.es_sistema,
    requiereMfa: fila.requiere_mfa,
    color: fila.color,
    permisos: permisosValidos(fila.rol_permisos.map((p) => p.permiso_clave)),
    // Sin `usuarios.ver` la RLS de `perfiles` solo deja ver la fila propia.
    usuarios: contarUsuarios ? conteo(fila.vigentes) : null,
    asignados: contarUsuarios ? conteo(fila.asignados) : null,
    creadoAt: fila.created_at,
    actualizadoAt: fila.updated_at,
  }
}

async function consultarRoles() {
  const supabase = await crearClienteServidor()
  return supabase
    .from("roles")
    .select(CONSULTA_ROL)
    .is("vigentes.deleted_at", null)
    .overrideTypes<FilaRol[], { merge: false }>()
}

/** Todos los roles visibles (sistema primero), con permisos y conteos. */
export const listarRoles = cache(
  async (contarUsuarios: boolean): Promise<RolDetalle[]> => {
    const { data, error } = await consultarRoles()
    if (error) fallar("listar los roles", error)
    return ordenarRoles(data.map((fila) => aRol(fila, contarUsuarios)))
  }
)

/** Un rol; `null` si no existe o la RLS no lo deja ver. `id` ya viene validado. */
export const obtenerRol = cache(
  async (id: string, contarUsuarios: boolean): Promise<RolDetalle | null> => {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("roles")
      .select(CONSULTA_ROL)
      .is("vigentes.deleted_at", null)
      .eq("id", id)
      .overrideTypes<FilaRol[], { merge: false }>()
    if (error) fallar("leer el rol", error)
    const fila = data[0]
    return fila ? aRol(fila, contarUsuarios) : null
  }
)

export const LIMITE_USUARIOS_ROL = 100

type FilaUsuario =
  Database["public"]["Functions"]["listar_usuarios"]["Returns"][number]

/** Cuentas vigentes con el rol, por nombre (`listar_usuarios` exige `usuarios.ver`). */
export async function usuariosDelRol(id: string): Promise<UsuariosDelRol> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc("listar_usuarios", {
    p_roles: [id],
    p_orden: "nombre",
    p_descendente: false,
    p_limite: LIMITE_USUARIOS_ROL,
  })
  if (error) fallar("listar los usuarios del rol", error)
  // Las SRF se tipan con columnas no nulas; `nombre` y el último acceso pueden serlo.
  const filas = data as (Omit<FilaUsuario, "nombre" | "ultimo_acceso_at"> & {
    nombre: string | null
    ultimo_acceso_at: string | null
  })[]
  return {
    total: filas[0]?.total ?? 0,
    usuarios: filas.map((fila) => ({
      id: fila.id,
      nombre: fila.nombre,
      email: fila.email,
      estado: fila.estado,
      mfaActivo: fila.mfa_activo,
      ultimoAccesoAt: fila.ultimo_acceso_at,
    })),
  }
}

export const LIMITE_HISTORIAL = 300

function comoObjeto(valor: Json | null): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? valor
    : {}
}

/** Cambios del rol y de sus permisos en la bitácora (RLS: `auditoria.ver`). */
export async function historialRol(id: string): Promise<EventoBitacoraRol[]> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from("bitacora")
    .select(
      "id, created_at, accion, entidad, actor_id, actor_email, actor_rol, cambios, origen"
    )
    .in("entidad", ["roles", "rol_permisos"])
    .eq("entidad_id", id)
    .order("id", { ascending: false })
    .limit(LIMITE_HISTORIAL)
  if (error) fallar("leer el historial del rol", error)
  return data.map((fila) => ({
    id: fila.id,
    at: fila.created_at,
    accion: fila.accion,
    entidad: fila.entidad,
    actorId: fila.actor_id,
    actorEmail: fila.actor_email,
    actorRol: fila.actor_rol,
    cambios: comoObjeto(fila.cambios),
    origen: fila.origen,
  }))
}
