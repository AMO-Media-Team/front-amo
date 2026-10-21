import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { cache } from "react"
import { z } from "zod"

import { describirAgente } from "@/lib/auth/agente-usuario"
import { crearClienteServidor } from "@/lib/supabase/server"
import type { Database, Json } from "@/types/database.types"

import { argumentosListado, type EstadoTablaUsuarios } from "./estado-tabla"
import {
  CAMPOS_CON_VALOR,
  type EventoActividad,
  type Organizacion,
  type Organizaciones,
  type PaginaUsuarios,
  type ResumenUsuarios,
  type RolAsignable,
  type RolResumen,
  type RolVisible,
  type SeguridadUsuario,
  type SesionUsuario,
  type UltimoAcceso,
  type UsuarioDetalle,
  type UsuarioFila,
} from "./tipos"

/**
 * Consultas del módulo de Usuarios con el cliente del USUARIO (JWT + RLS): la
 * base de datos decide qué filas y columnas ve cada quien. Las SRF
 * (`listar_usuarios`, `seguridad_usuario`…) son `security definer` porque leen
 * `auth.*`, y verifican `acceso_valido()` + `usuarios.ver` por dentro.
 * Un error de consulta se lanza: lo recoge el límite de error de la sección.
 */

type Funciones = Database["public"]["Functions"]

/**
 * Los tipos generados declaran no nulas todas las columnas que devuelve una
 * SRF; aquí se declara la verdad para las que sí pueden ser nulas.
 */
type ConNulos<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null }

type FilaListado = ConNulos<
  Funciones["listar_usuarios"]["Returns"][number],
  | "nombre"
  | "avatar_path"
  | "rol_id"
  | "rol_clave"
  | "rol_nombre"
  | "rol_color"
  | "rol_tipo"
  | "ultimo_acceso_at"
  | "invitado_at"
>

function fallar(operacion: string, error: { code?: string | null }): never {
  throw new Error(`No se pudo ${operacion} (${error.code ?? "sin código"}).`)
}

function rolDeFila(fila: FilaListado): RolResumen | null {
  if (!fila.rol_id || !fila.rol_clave || !fila.rol_nombre || !fila.rol_tipo)
    return null
  return {
    id: fila.rol_id,
    clave: fila.rol_clave,
    nombre: fila.rol_nombre,
    color: fila.rol_color ?? "#8C66EE",
    tipo: fila.rol_tipo,
  }
}

function aUsuarioFila(fila: FilaListado): UsuarioFila {
  return {
    id: fila.id,
    nombre: fila.nombre,
    email: fila.email,
    estado: fila.estado,
    rol: rolDeFila(fila),
    mfaActivo: fila.mfa_activo,
    ultimoAccesoAt: fila.ultimo_acceso_at,
    invitadoAt: fila.invitado_at,
    creadoAt: fila.created_at,
  }
}

/** Una página del listado según el estado de la URL (paginación en el servidor). */
export async function listarUsuarios(
  estado: EstadoTablaUsuarios
): Promise<PaginaUsuarios> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc(
    "listar_usuarios",
    argumentosListado(estado)
  )
  if (error) fallar("listar los usuarios", error)
  const filas = data as FilaListado[]
  return { filas: filas.map(aUsuarioFila), total: filas[0]?.total ?? 0 }
}

export async function resumenUsuarios(): Promise<ResumenUsuarios> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc("resumen_usuarios")
  if (error) fallar("calcular el resumen de usuarios", error)
  const fila = data[0]
  return {
    total: fila?.total ?? 0,
    activos: fila?.activos ?? 0,
    invitados: fila?.invitados ?? 0,
    suspendidos: fila?.suspendidos ?? 0,
    desactivados: fila?.desactivados ?? 0,
    activosConMfa: fila?.activos_con_mfa ?? 0,
  }
}

/** Roles que el usuario en sesión puede asignar (anti-escalada, calculada en la BD). */
export const rolesAsignables = cache(async (): Promise<RolAsignable[]> => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc("roles_asignables")
  if (error) fallar("leer los roles asignables", error)
  return (
    data as ConNulos<
      Funciones["roles_asignables"]["Returns"][number],
      "descripcion"
    >[]
  ).map((rol) => ({
    id: rol.id,
    clave: rol.clave,
    nombre: rol.nombre,
    descripcion: rol.descripcion,
    tipo: rol.tipo,
    color: rol.color,
    requiereMfa: rol.requiere_mfa,
  }))
})

/** Todos los roles visibles (filtro del listado y nombres en la línea de tiempo). */
export const rolesVisibles = cache(async (): Promise<RolVisible[]> => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from("roles")
    .select("id, clave, nombre, color, tipo, requiere_mfa")
    .order("tipo")
    .order("nombre")
  if (error) fallar("leer los roles", error)
  return data.map(({ requiere_mfa, ...rol }) => ({
    ...rol,
    requiereMfa: requiere_mfa,
  }))
})

const CONSULTA_DETALLE = `
  id, email, nombre, celular, estado, debe_cambiar_password, motivo_estado,
  activado_at, suspendido_at, desactivado_at, ultimo_acceso_at, created_at, updated_at,
  anunciante_id, medio_id, es_demo,
  rol:roles!perfiles_rol_id_fkey ( id, clave, nombre, color, tipo ),
  invitador:invitado_por ( id, nombre, email )
` as const

type FilaSeguridad = ConNulos<
  Funciones["seguridad_usuario"]["Returns"][number],
  | "email_confirmado_at"
  | "ultimo_ingreso_at"
  | "bloqueado_hasta"
  | "invitado_at"
  | "mfa_activado_at"
  | "mfa_ultimo_uso_at"
>

function aSeguridad(fila: FilaSeguridad | undefined): SeguridadUsuario {
  return {
    emailConfirmadoAt: fila?.email_confirmado_at ?? null,
    ultimoIngresoAt: fila?.ultimo_ingreso_at ?? null,
    bloqueadoHasta: fila?.bloqueado_hasta ?? null,
    invitadoAt: fila?.invitado_at ?? null,
    factoresMfa: fila?.mfa_factores ?? 0,
    mfaActivadoAt: fila?.mfa_activado_at ?? null,
    mfaUltimoUsoAt: fila?.mfa_ultimo_uso_at ?? null,
    sesionesActivas: fila?.sesiones_activas ?? 0,
  }
}

export interface FichaUsuario {
  usuario: UsuarioDetalle
  seguridad: SeguridadUsuario
}

/** Perfil (RLS) + estado de seguridad (SRF) de un usuario; `null` si no existe o no es visible. */
export const obtenerFichaUsuario = cache(
  async (id: string): Promise<FichaUsuario | null> => {
    const supabase = await crearClienteServidor()
    const [perfil, seguridad] = await Promise.all([
      supabase
        .from("perfiles")
        .select(CONSULTA_DETALLE)
        .eq("id", id)
        .maybeSingle(),
      supabase.rpc("seguridad_usuario", { p_usuario_id: id }),
    ])
    if (perfil.error) fallar("leer el usuario", perfil.error)
    if (seguridad.error)
      fallar("leer la seguridad del usuario", seguridad.error)
    const fila = perfil.data
    if (!fila) return null

    const datosSeguridad = aSeguridad((seguridad.data as FilaSeguridad[])[0])
    return {
      seguridad: datosSeguridad,
      usuario: {
        id: fila.id,
        nombre: fila.nombre,
        email: fila.email,
        estado: fila.estado,
        rol: fila.rol,
        mfaActivo: datosSeguridad.factoresMfa > 0,
        ultimoAccesoAt: fila.ultimo_acceso_at,
        invitadoAt: datosSeguridad.invitadoAt,
        creadoAt: fila.created_at,
        celular: fila.celular,
        debeCambiarPassword: fila.debe_cambiar_password,
        motivoEstado: fila.motivo_estado,
        activadoAt: fila.activado_at,
        suspendidoAt: fila.suspendido_at,
        desactivadoAt: fila.desactivado_at,
        actualizadoAt: fila.updated_at,
        anuncianteId: fila.anunciante_id,
        medioId: fila.medio_id,
        invitadoPor: fila.invitador,
        esDemo: fila.es_demo,
      },
    }
  }
)

type FilaSesion = ConNulos<
  Funciones["sesiones_usuario"]["Returns"][number],
  "refrescada_at" | "ultima_actividad_at" | "aal" | "user_agent"
>

export async function sesionesUsuario(id: string): Promise<SesionUsuario[]> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc("sesiones_usuario", {
    p_usuario_id: id,
  })
  if (error) fallar("leer las sesiones", error)
  return (data as FilaSesion[]).map((sesion) => {
    const agente = describirAgente(sesion.user_agent)
    return {
      id: sesion.id,
      creadaAt: sesion.creada_at,
      ultimaActividadAt: sesion.ultima_actividad_at ?? sesion.refrescada_at,
      aal: sesion.aal === "aal2" || sesion.aal === "aal1" ? sesion.aal : null,
      navegador: agente.navegador,
      sistemaOperativo: agente.sistemaOperativo,
      dispositivo: sesion.user_agent ? agente.dispositivo : null,
      ip: typeof sesion.ip === "string" ? sesion.ip : null,
    }
  })
}

/** Último ingreso exitoso con su ubicación (RLS: requiere `accesos.ver`). */
export async function ultimoAcceso(id: string): Promise<UltimoAcceso | null> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from("accesos")
    .select("created_at, pais_iso2, ciudad")
    .eq("usuario_id", id)
    .eq("evento", "LOGIN_EXITOSO")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) fallar("leer el último acceso", error)
  return data
    ? { at: data.created_at, paisIso2: data.pais_iso2, ciudad: data.ciudad }
    : null
}

export const LIMITE_ACTIVIDAD = 40

function comoObjeto(valor: Json | null): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? valor
    : {}
}

/** Diff `{col: {antes, despues}}` de un UPDATE; en INSERT/DELETE `cambios` es la fila. */
function camposDelDiff(accion: string, cambios: Json | null) {
  const diff = comoObjeto(cambios)
  if (accion !== "UPDATE" && accion !== "TRANSICION")
    return { campos: [], valores: {} }
  const valores: EventoActividad["valores"] = {}
  for (const campo of CAMPOS_CON_VALOR) {
    const cambio = comoObjeto((diff[campo] as Json | undefined) ?? null)
    if ("despues" in cambio)
      valores[campo] = { antes: cambio.antes, despues: cambio.despues }
  }
  return { campos: Object.keys(diff), valores }
}

/**
 * Línea de tiempo de un usuario: lo que se hizo sobre su perfil y lo que él
 * hizo (RLS: requiere `auditoria.ver`). `id` ya viene validado como UUID.
 */
export async function actividadUsuario(id: string): Promise<EventoActividad[]> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from("bitacora")
    .select(
      "id, created_at, accion, entidad, entidad_id, actor_id, actor_email, actor_rol, estado_anterior, estado_nuevo, cambios, metadatos, motivo, origen"
    )
    .or(`and(entidad.eq.perfiles,entidad_id.eq.${id}),actor_id.eq.${id}`)
    .order("id", { ascending: false })
    .limit(LIMITE_ACTIVIDAD)
  if (error) fallar("leer la actividad", error)
  return data.map((fila) => {
    const { campos, valores } = camposDelDiff(fila.accion, fila.cambios)
    return {
      id: fila.id,
      at: fila.created_at,
      accion: fila.accion,
      entidad: fila.entidad,
      entidadId: fila.entidad_id,
      actorId: fila.actor_id,
      actorEmail: fila.actor_email,
      actorRol: fila.actor_rol,
      estadoAnterior: fila.estado_anterior,
      estadoNuevo: fila.estado_nuevo,
      camposCambiados: campos,
      valores,
      metadatos: comoObjeto(fila.metadatos),
      motivo: fila.motivo,
      origen: fila.origen,
    }
  })
}

/** Permisos de un rol (RLS: requiere `roles.ver` o que sea el rol propio). */
export async function permisosDelRol(rolId: string): Promise<string[]> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from("rol_permisos")
    .select("permiso_clave")
    .eq("rol_id", rolId)
  if (error) fallar("leer los permisos del rol", error)
  return data.map((fila) => fila.permiso_clave)
}

// ── Organizaciones (anunciantes y medios) ───────────────────────────────────

const esquemaOrganizaciones = z.array(
  z.object({ id: z.uuid(), nombre: z.string() })
)

/** PostgREST: la tabla aún no existe en el esquema expuesto. */
const TABLA_INEXISTENTE = new Set(["PGRST205", "42P01"])

/**
 * `anunciantes` y `medios` llegan con la migración `negocio_actores` (M6) y
 * todavía no están en `database.types.ts`: se consultan sin tipos y se validan
 * con zod. Mientras no existan, el selector queda vacío (y la interfaz explica
 * por qué). Al regenerar los tipos, esta consulta puede volver a ser tipada.
 */
async function listarOrganizaciones(
  tabla: "anunciantes" | "medios",
  columnaNombre: "nombre_comercial" | "nombre"
): Promise<Organizacion[]> {
  const supabase = (await crearClienteServidor()) as unknown as SupabaseClient
  const { data, error } = await supabase
    .from(tabla)
    .select(`id, nombre:${columnaNombre}`)
    .is("deleted_at", null)
    .order(columnaNombre)
    .limit(500)
  if (error) {
    if (TABLA_INEXISTENTE.has(error.code)) return []
    fallar(`leer ${tabla}`, error)
  }
  return esquemaOrganizaciones.parse(data)
}

export const organizaciones = cache(async (): Promise<Organizaciones> => {
  const [anunciantes, medios] = await Promise.all([
    listarOrganizaciones("anunciantes", "nombre_comercial"),
    listarOrganizaciones("medios", "nombre"),
  ])
  return { anunciantes, medios }
})
