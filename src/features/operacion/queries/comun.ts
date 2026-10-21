import "server-only"

import { cache } from "react"

import {
  obtenerDepartamento,
  obtenerMunicipio,
  obtenerPais,
} from "@/lib/geo/catalogo"
import { crearClienteServidor } from "@/lib/supabase/server"
import {
  CLAVE_VIGENCIA_URL_FIRMADA,
  VIGENCIA_URL_FIRMADA_POR_DEFECTO_S,
} from "@/lib/supabase/vigencia-url-firmada"
import type { Json } from "@/types/database.types"

import type { Plataforma } from "../estados"

/**
 * Utilidades de lectura de la operación. Todo se lee con el cliente del
 * USUARIO (JWT + RLS): la BD decide qué filas ve cada rol. Un error de lectura
 * se lanza y lo recoge el límite de error de la sección.
 */

export type ClienteServidor = Awaited<ReturnType<typeof crearClienteServidor>>

/** Un cliente por solicitud: las secciones de una página lo comparten. */
export const clienteSolicitud = cache(crearClienteServidor)

export interface ErrorConsulta {
  code?: string | null
}

export function fallar(operacion: string, error: ErrorConsulta): never {
  throw new Error(`No se pudo ${operacion} (${error.code ?? "sin código"}).`)
}

/** Filas por solicitud que admite la API (`max_rows` de Supabase). */
export const FILAS_POR_SOLICITUD = 1000

/** Tope de seguridad de las lecturas completas (resúmenes de una ficha). */
const MAXIMO_FILAS = 20_000

type Lectura<T> = PromiseLike<{
  data: T[] | null
  error: ErrorConsulta | null
}>

/**
 * Lee todas las filas de una consulta en tramos de 1.000. `leer` debe
 * construir una consulta nueva en cada llamada y ordenar por una clave única.
 */
export async function leerTodo<T>(
  operacion: string,
  leer: (desde: number, hasta: number) => Lectura<T>
): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; desde < MAXIMO_FILAS; desde += FILAS_POR_SOLICITUD) {
    const { data, error } = await leer(desde, desde + FILAS_POR_SOLICITUD - 1)
    if (error) fallar(operacion, error)
    const tramo = data ?? []
    filas.push(...tramo)
    if (tramo.length < FILAS_POR_SOLICITUD) break
  }
  return filas
}

/** Trocea una lista para filtros `in (...)` sin URL demasiado largas. */
export function enLotes<T>(elementos: readonly T[], tamano = 150): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < elementos.length; i += tamano) {
    lotes.push(elementos.slice(i, i + tamano))
  }
  return lotes
}

type LecturaPagina<T> = PromiseLike<{
  data: T[] | null
  error: ErrorConsulta | null
  count: number | null
}>

/** PostgREST: el desplazamiento pedido supera el total de filas. */
const FUERA_DE_RANGO = "PGRST103"

/**
 * Una página con su total (`count: "exact"`). Si la página pedida ya no
 * existe (p. ej. tras filtrar), devuelve la última que sí existe.
 */
export async function leerPagina<T>(
  operacion: string,
  pagina: number,
  tamano: number,
  consultar: (desde: number, hasta: number) => LecturaPagina<T>
): Promise<{ filas: T[]; total: number }> {
  const desde = (Math.max(1, pagina) - 1) * tamano
  const respuesta = await consultar(desde, desde + tamano - 1)
  if (respuesta.error?.code === FUERA_DE_RANGO) {
    const conteo = await consultar(0, 0)
    if (conteo.error) fallar(operacion, conteo.error)
    const total = conteo.count ?? 0
    if (total === 0) return { filas: [], total }
    const ultima = Math.floor((total - 1) / tamano) * tamano
    const final = await consultar(ultima, ultima + tamano - 1)
    if (final.error) fallar(operacion, final.error)
    return { filas: final.data ?? [], total: final.count ?? total }
  }
  if (respuesta.error) fallar(operacion, respuesta.error)
  return { filas: respuesta.data ?? [], total: respuesta.count ?? 0 }
}

/** Filtro imposible para `in (...)` vacío: PostgREST rechaza `in.()`. */
export const SIN_COINCIDENCIAS = ["00000000-0000-0000-0000-000000000000"]

// ── Nombres de geografía (diccionarios locales; no viajan al navegador) ─────

export function nombreMunicipio(codigo: string | null): string | null {
  return codigo ? (obtenerMunicipio(codigo)?.nombre ?? codigo) : null
}

export function nombreDepartamento(codigo: string | null): string | null {
  return codigo ? (obtenerDepartamento(codigo)?.nombre ?? codigo) : null
}

/** Bogotá, D.C. es municipio y departamento a la vez. */
const DISTRITO_CAPITAL = "11"

/**
 * Departamento que acompaña al municipio en pantalla ("Pasto, Nariño"). En
 * Bogotá no se repite el nombre; `corto` usa "San Andrés" o "Valle del Cauca"
 * para los listados.
 */
export function departamentoJuntoAMunicipio(
  codigo: string | null,
  { corto = false }: { corto?: boolean } = {}
): string | null {
  if (!codigo || codigo === DISTRITO_CAPITAL) return null
  const departamento = obtenerDepartamento(codigo)
  if (!departamento) return codigo
  return corto ? departamento.nombreCorto : departamento.nombre
}

export function nombrePais(iso2: string | null): string | null {
  return iso2 ? (obtenerPais(iso2.toUpperCase())?.nombre ?? iso2) : null
}

// ── Catálogos (una lectura por solicitud) ────────────────────────────────────

export interface Franja {
  id: string
  clave: string
  nombre: string
  orden: number
}

export interface Formato {
  id: string
  nombre: string
  plataforma: Plataforma
}

export interface Catalogos {
  franjas: ReadonlyMap<string, Franja>
  formatos: ReadonlyMap<string, Formato>
  categorias: ReadonlyMap<string, string>
  sectores: ReadonlyMap<string, string>
}

/** Franjas, formatos, categorías y sectores (incluidos los inactivos: hay histórico). */
export const catalogos = cache(async (): Promise<Catalogos> => {
  const supabase = await clienteSolicitud()
  const [franjas, formatos, categorias, sectores] = await Promise.all([
    supabase.from("franjas").select("id, clave, nombre, orden").order("orden"),
    supabase
      .from("formatos")
      .select("id, nombre, plataforma, orden")
      .order("orden"),
    supabase.from("categorias").select("id, nombre, orden").order("orden"),
    supabase.from("sectores").select("id, nombre, orden").order("orden"),
  ])
  if (franjas.error) fallar("leer las franjas", franjas.error)
  if (formatos.error) fallar("leer los formatos", formatos.error)
  if (categorias.error) fallar("leer las categorías", categorias.error)
  if (sectores.error) fallar("leer los sectores", sectores.error)
  return {
    franjas: new Map(franjas.data.map((franja) => [franja.id, franja])),
    formatos: new Map(
      formatos.data.map((formato) => [
        formato.id,
        {
          id: formato.id,
          nombre: formato.nombre,
          plataforma: formato.plataforma,
        },
      ])
    ),
    categorias: new Map(categorias.data.map((c) => [c.id, c.nombre])),
    sectores: new Map(sectores.data.map((s) => [s.id, s.nombre])),
  }
})

// ── Parámetros de configuración que usan las fichas ──────────────────────────

export interface ConfiguracionOperacion {
  diasVigenciaVerificacion: number
  diasGraciaVerificacion: number
  nMinimoCumplimiento: number
  /** Segundos que vive una URL firmada de Storage (§8). */
  vigenciaUrlFirmadaSegundos: number
}

/** Valores por defecto de docs/modelo-datos.md §7 si la clave no es visible. */
const POR_DEFECTO: ConfiguracionOperacion = {
  diasVigenciaVerificacion: 30,
  diasGraciaVerificacion: 7,
  nMinimoCumplimiento: 3,
  vigenciaUrlFirmadaSegundos: VIGENCIA_URL_FIRMADA_POR_DEFECTO_S,
}

const CLAVES_CONFIGURACION: Readonly<
  Record<keyof ConfiguracionOperacion, string>
> = {
  diasVigenciaVerificacion: "medios.reverificacion_dias",
  diasGraciaVerificacion: "medios.reverificacion_gracia_dias",
  nMinimoCumplimiento: "medios.n_minimo_cumplimiento",
  vigenciaUrlFirmadaSegundos: CLAVE_VIGENCIA_URL_FIRMADA,
}

function comoNumero(valor: Json | undefined, respaldo: number): number {
  const numero = typeof valor === "string" ? Number(valor) : valor
  return typeof numero === "number" && Number.isFinite(numero)
    ? numero
    : respaldo
}

export const configuracionOperacion = cache(
  async (): Promise<ConfiguracionOperacion> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase
      .from("configuracion")
      .select("clave, valor")
      .in("clave", Object.values(CLAVES_CONFIGURACION))
    if (error) fallar("leer la configuración", error)
    const valores = new Map(data.map((fila) => [fila.clave, fila.valor]))
    const entradas = Object.entries(CLAVES_CONFIGURACION) as [
      keyof ConfiguracionOperacion,
      string,
    ][]
    return Object.fromEntries(
      entradas.map(([campo, clave]) => [
        campo,
        comoNumero(valores.get(clave), POR_DEFECTO[campo]),
      ])
    ) as unknown as ConfiguracionOperacion
  }
)
