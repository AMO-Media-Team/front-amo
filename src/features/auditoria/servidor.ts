import "server-only"

import { cache } from "react"

import { registrarEvento } from "@/lib/auth/registro"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { obtenerPais } from "@/lib/geo/catalogo"
import { crearClienteServidor } from "@/lib/supabase/server"
import type { Json } from "@/types/database.types"

import { FILAS_POR_SOLICITUD, rangosDePaginas } from "./agregados"
import type { PerfilResumen, RolResumen } from "./presentacion"

/**
 * Utilidades de servidor compartidas por Auditoría y Accesos (no son
 * acciones). Las lecturas usan el cliente del USUARIO: la RLS decide qué
 * filas ve (`auditoria.ver`, `accesos.ver`, `usuarios.ver`…).
 */

export interface ErrorConsulta {
  code?: string | null
}

/** Un error de lectura se lanza: lo recoge el límite de error de la sección. */
export function fallar(operacion: string, error: ErrorConsulta): never {
  throw new Error(`No se pudo ${operacion} (${error.code ?? "sin código"}).`)
}

/** Log de servidor sin datos personales. */
export function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[auditoria] ${operacion} falló (${codigo})`)
}

type Lectura<T> = PromiseLike<{ data: T[] | null; error: ErrorConsulta | null }>

/**
 * Lee hasta `maximo` filas en solicitudes paralelas de 1.000 (el tope de la
 * API). `completa` indica si la muestra cubre las `total` filas.
 */
export async function leerMuestra<T>(
  operacion: string,
  total: number,
  maximo: number,
  leer: (desde: number, hasta: number) => Lectura<T>
): Promise<{ filas: T[]; completa: boolean }> {
  const paginas = await Promise.all(
    rangosDePaginas(total, maximo, FILAS_POR_SOLICITUD).map(([desde, hasta]) =>
      leer(desde, hasta)
    )
  )
  const filas: T[] = []
  for (const { data, error } of paginas) {
    if (error) fallar(operacion, error)
    filas.push(...(data ?? []))
  }
  return { filas, completa: total <= maximo }
}

/** Roles de la plataforma por clave y por id (nombres y colores de los distintivos). */
export const rolesDeLaPlataforma = cache(async () => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from("roles")
    .select("id, clave, nombre, color")
  if (error) fallar("leer los roles", error)
  const porClave = new Map<string, RolResumen>()
  const porId = new Map<string, string>()
  for (const rol of data) {
    porClave.set(rol.clave, { nombre: rol.nombre, color: rol.color })
    porId.set(rol.id, rol.nombre)
  }
  return { porClave, porId }
})

export interface PerfilVisible extends PerfilResumen {
  rol: string | null
  color: string | null
}

const LOTE_PERFILES = 150

async function leerPerfiles(
  ids: readonly string[]
): Promise<Map<string, PerfilVisible>> {
  const supabase = await crearClienteServidor()
  const lotes: string[][] = []
  for (let i = 0; i < ids.length; i += LOTE_PERFILES) {
    lotes.push(ids.slice(i, i + LOTE_PERFILES))
  }
  const respuestas = await Promise.all(
    lotes.map((lote) =>
      supabase
        .from("perfiles")
        .select(
          "id, nombre, email, rol:roles!perfiles_rol_id_fkey ( nombre, color )"
        )
        .in("id", lote)
    )
  )
  const perfiles = new Map<string, PerfilVisible>()
  for (const { data, error } of respuestas) {
    if (error) fallar("leer los perfiles", error)
    for (const perfil of data) {
      perfiles.set(perfil.id, {
        nombre: perfil.nombre,
        email: perfil.email,
        rol: perfil.rol?.nombre ?? null,
        color: perfil.rol?.color ?? null,
      })
    }
  }
  return perfiles
}

const perfilesPorClave = cache((clave: string) =>
  leerPerfiles(clave ? clave.split(",") : [])
)

/**
 * Perfiles visibles para quien consulta (la RLS de `perfiles` exige
 * `usuarios.ver`): sin ese permiso el mapa llega vacío y la interfaz muestra
 * el correo enmascarado de la bitácora. Memorizado por solicitud.
 */
export function perfilesVisibles(
  ids: readonly string[]
): Promise<Map<string, PerfilVisible>> {
  const unicos = [...new Set(ids.map((id) => id.toLowerCase()))].sort()
  return perfilesPorClave(unicos.join(","))
}

/**
 * Ids de personas cuyo nombre o correo coincide con la búsqueda (máx. 50).
 * Memorizado por solicitud: el conteo y la lista de la misma vista lo comparten.
 */
export const perfilesQueCoinciden = cache(async function perfilesQueCoinciden(
  patron: string | null
): Promise<string[]> {
  if (!patron) return []
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from("perfiles")
    .select("id")
    .or(`nombre.ilike.${patron},email.ilike.${patron}`)
    .limit(50)
  if (error) fallar("buscar personas", error)
  return data.map((perfil) => perfil.id)
})

export function nombrePais(iso2: string): string | null {
  return obtenerPais(iso2.toUpperCase())?.nombre ?? null
}

/**
 * `EXPORTAR` en la bitácora con el formato, las filas y los filtros (§5.3).
 * Se registra en el servidor ANTES de entregar los datos: la exportación
 * queda auditada aunque el navegador no llegue a generar el archivo.
 */
export function registrarExportacion(
  actor: UsuarioSesion,
  entidad: "bitacora" | "accesos",
  metadatos: Record<string, Json>
): Promise<boolean> {
  return registrarEvento({
    actorId: actor.id,
    accion: "EXPORTAR",
    entidad,
    metadatos,
  })
}
