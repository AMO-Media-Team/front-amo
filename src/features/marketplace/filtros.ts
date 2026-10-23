/**
 * Filtros del marketplace en la URL (módulo puro; mismos parsers en servidor
 * y cliente): plataforma, sector y anunciante, días de publicación, orden por
 * fecha límite o por pago, «Ver las que rechacé» y la página (MED-008). Los
 * valores por defecto no se escriben en la URL: `/ofertas` sin parámetros es
 * la vista de siempre.
 *
 *   /ofertas?plataforma=instagram&sector=<uuid>&anunciante=<uuid>&desde=2026-10-24&hasta=2026-10-31&orden=pago&rechazadas=true&pagina=2
 *
 * `desde` y `hasta` son días de Bogotá: la BD deja las ofertas cuya ventana
 * de publicación toca alguno de esos días.
 */
import type { Route } from "next"
import {
  createLoader,
  createParser,
  parseAsBoolean,
  parseAsInteger,
  parseAsStringLiteral,
} from "nuqs/server"

import type { Plataforma } from "@/features/operacion/estados"
import { parsearFecha } from "@/lib/fechas"

import { RUTA_OFERTAS_MEDIO } from "./rutas"

/** Ofertas por página del listado. */
export const TAMANO_PAGINA_MARKETPLACE = 20

/** La plataforma en la URL va en minúsculas (`?plataforma=tiktok`). */
export const PLATAFORMAS_URL = ["instagram", "facebook", "tiktok"] as const
export type PlataformaUrl = (typeof PLATAFORMAS_URL)[number]

export const ORDENES_MARKETPLACE = ["fecha", "pago"] as const
export type OrdenMarketplace = (typeof ORDENES_MARKETPLACE)[number]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Id de un sector o un anunciante; cualquier otro texto se ignora. */
const parseAsUuid = createParser<string>({
  parse: (valor) => (UUID.test(valor) ? valor.toLowerCase() : null),
  serialize: (valor) => valor,
})

/** Día de calendario `YYYY-MM-DD`; cualquier otro texto se ignora. */
const parseAsDia = createParser<string>({
  parse: (valor) => (parsearFecha(valor) ? valor : null),
  serialize: (valor) => valor,
})

export const parsersMarketplace = {
  plataforma: parseAsStringLiteral(PLATAFORMAS_URL),
  sector: parseAsUuid,
  anunciante: parseAsUuid,
  desde: parseAsDia,
  hasta: parseAsDia,
  orden: parseAsStringLiteral(ORDENES_MARKETPLACE).withDefault("fecha"),
  rechazadas: parseAsBoolean.withDefault(false),
  pagina: parseAsInteger.withDefault(1),
}

/** Servidor: `await cargarFiltrosMarketplace(searchParams)`. */
export const cargarFiltrosMarketplace = createLoader(parsersMarketplace)

export interface FiltrosMarketplace {
  plataforma: PlataformaUrl | null
  /** Sector del anunciante (`sectores.id`). */
  sector: string | null
  anunciante: string | null
  /** Primer y último día de publicación (`YYYY-MM-DD`, Bogotá). */
  desde: string | null
  hasta: string | null
  orden: OrdenMarketplace
  rechazadas: boolean
  pagina: number
}

export const FILTROS_POR_DEFECTO: FiltrosMarketplace = {
  plataforma: null,
  sector: null,
  anunciante: null,
  desde: null,
  hasta: null,
  orden: "fecha",
  rechazadas: false,
  pagina: 1,
}

/** Lo que «Limpiar filtros» quita (el orden no reduce el listado: se queda). */
export const FILTROS_LIMPIOS = {
  plataforma: null,
  sector: null,
  anunciante: null,
  desde: null,
  hasta: null,
  rechazadas: null,
  pagina: null,
} as const

/**
 * Días de publicación para la consulta: un rango escrito al revés en la URL
 * (`desde` después de `hasta`) se lee al derecho.
 */
export function diasPublicacion(
  filtros: Pick<FiltrosMarketplace, "desde" | "hasta">
): { desde: string | null; hasta: string | null } {
  const { desde, hasta } = filtros
  if (desde && hasta && desde > hasta) return { desde: hasta, hasta: desde }
  return { desde, hasta }
}

export function plataformaDeUrl(
  valor: PlataformaUrl | null
): Plataforma | null {
  return valor ? (valor.toUpperCase() as Plataforma) : null
}

export function plataformaParaUrl(plataforma: Plataforma): PlataformaUrl {
  return plataforma.toLowerCase() as PlataformaUrl
}

/** Página válida (entera, desde 1). */
export function paginaValida(pagina: number): number {
  return Number.isFinite(pagina) ? Math.max(1, Math.trunc(pagina)) : 1
}

/** Filas que se saltan para pedir la página (`p_desplazamiento`). */
export function desplazamientoDe(pagina: number): number {
  return (paginaValida(pagina) - 1) * TAMANO_PAGINA_MARKETPLACE
}

/** Última página con `total` ofertas (al menos la 1). */
export function ultimaPagina(total: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / TAMANO_PAGINA_MARKETPLACE))
}

/** «Hay algún filtro que reduce (o cambia) el listado» (estado vacío y «Limpiar filtros»). */
export function hayFiltros(filtros: FiltrosMarketplace): boolean {
  return (
    filtros.plataforma !== null ||
    filtros.sector !== null ||
    filtros.anunciante !== null ||
    filtros.desde !== null ||
    filtros.hasta !== null ||
    filtros.rechazadas
  )
}

/** ¿El único filtro es la plataforma? (el estado vacío lo dice con su nombre). */
export function soloPlataforma(filtros: FiltrosMarketplace): boolean {
  return (
    filtros.plataforma !== null && !hayFiltros({ ...filtros, plataforma: null })
  )
}

/**
 * `/ofertas` con los filtros dados; omite los valores por defecto para que
 * la URL coincida con la que escribe nuqs (y la primera página no lleva
 * `?pagina=1`).
 */
export function rutaMarketplace(
  filtros: Partial<FiltrosMarketplace> = {}
): Route {
  const completos = { ...FILTROS_POR_DEFECTO, ...filtros }
  const parametros = new URLSearchParams()
  if (completos.plataforma) parametros.set("plataforma", completos.plataforma)
  if (completos.sector) parametros.set("sector", completos.sector)
  if (completos.anunciante) parametros.set("anunciante", completos.anunciante)
  if (completos.desde) parametros.set("desde", completos.desde)
  if (completos.hasta) parametros.set("hasta", completos.hasta)
  if (completos.orden !== FILTROS_POR_DEFECTO.orden) {
    parametros.set("orden", completos.orden)
  }
  if (completos.rechazadas) parametros.set("rechazadas", "true")
  const pagina = paginaValida(completos.pagina)
  if (pagina > 1) parametros.set("pagina", String(pagina))
  const consulta = parametros.toString()
  return (
    consulta ? `${RUTA_OFERTAS_MEDIO}?${consulta}` : RUTA_OFERTAS_MEDIO
  ) as Route
}
