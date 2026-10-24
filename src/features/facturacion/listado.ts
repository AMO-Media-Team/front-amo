/**
 * Estado del listado de facturas en la URL (módulo puro): búsqueda, estado,
 * anunciante, periodo de emisión (`?desde=&hasta=`), orden y página, con los
 * MISMOS parsers en el servidor y en la tabla. Por defecto, lo más reciente
 * primero (los borradores recién generados quedan arriba).
 */
import type { Route } from "next"
import { createLoader, createParser } from "nuqs/server"

import {
  definirEstadoTabla,
  type EstadoTabla,
  filtroDeIds,
  filtroDeOpciones,
} from "@/components/data-table/estado-url"
import {
  parsearFecha,
  type PresetAutomatico,
  rangoDesdePreset,
  serializarFecha,
} from "@/lib/fechas"
import { Constants } from "@/types/database.types"

import { RUTA_CARTERA, RUTA_FACTURAS } from "./rutas"
import type { EstadoFactura } from "./tipos"

/** Día `YYYY-MM-DD`; cualquier otro texto se ignora. */
export const parseAsDia = createParser<string>({
  parse: (valor) => (parsearFecha(valor) ? valor : null),
  serialize: (valor) => valor,
})

export const CAMPOS_ORDEN_FACTURAS = [
  "creada",
  "emision",
  "vencimiento",
  "total",
  "saldo",
] as const

export type CampoOrdenFacturas = (typeof CAMPOS_ORDEN_FACTURAS)[number]

/** Columna de `facturas` de cada campo de orden. */
export const COLUMNA_ORDEN: Readonly<Record<CampoOrdenFacturas, string>> = {
  creada: "created_at",
  emision: "fecha_emision",
  vencimiento: "fecha_vencimiento",
  total: "total",
  saldo: "saldo",
}

export const estadoTablaFacturas = definirEstadoTabla({
  camposOrden: CAMPOS_ORDEN_FACTURAS,
  ordenPorDefecto: { campo: "creada", descendente: true },
  filtros: {
    estado: filtroDeOpciones(Constants.public.Enums.factura_estado),
    anunciante: filtroDeIds(),
    // El periodo no es una faceta: lo escribe su propio selector (emisión).
    desde: parseAsDia,
    hasta: parseAsDia,
  },
})

export type EstadoTablaFacturas = EstadoTabla<typeof estadoTablaFacturas>

/** Orden de las opciones del filtro de estado (el ciclo de la factura). */
export const ORDEN_ESTADOS_FACTURA: readonly EstadoFactura[] = [
  "BORRADOR",
  "EMITIDA",
  "PAGADA_PARCIAL",
  "VENCIDA",
  "PAGADA",
  "ANULADA",
]

/** Periodo de emisión válido: ambas fechas y en orden. */
export function periodoEmision(estado: {
  desde: string | null
  hasta: string | null
}): { desde: string; hasta: string } | null {
  const { desde, hasta } = estado
  if (!desde || !hasta) return null
  return desde <= hasta ? { desde, hasta } : { desde: hasta, hasta: desde }
}

/** Atajos del periodo de emisión, en el orden en que se ofrecen. */
export const PRESETS_EMISION = [
  "esteMes",
  "mesAnterior",
  "ultimos30",
  "esteTrimestre",
  "esteAno",
] as const satisfies readonly PresetAutomatico[]

export type PresetEmision = (typeof PRESETS_EMISION)[number]

/** Días `YYYY-MM-DD` de un atajo, calculados hoy en Bogotá. */
export function extremosDePreset(
  preset: PresetEmision,
  ahora: Date = new Date()
): { desde: string; hasta: string } {
  const rango = rangoDesdePreset(preset, ahora)
  return {
    desde: serializarFecha(rango.desde),
    hasta: serializarFecha(rango.hasta),
  }
}

/**
 * Qué atajo representa el periodo de la URL: `"todo"` sin periodo, el atajo
 * cuyas fechas coinciden hoy o `null` (un rango elegido en el calendario).
 */
export function atajoDePeriodo(
  periodo: { desde: string; hasta: string } | null,
  ahora: Date = new Date()
): PresetEmision | "todo" | null {
  if (!periodo) return "todo"
  return (
    PRESETS_EMISION.find((preset) => {
      const extremos = extremosDePreset(preset, ahora)
      return (
        extremos.desde === periodo.desde && extremos.hasta === periodo.hasta
      )
    }) ?? null
  )
}

/** Listado filtrado (enlaces desde la cartera y el resumen). */
export function rutaFacturasFiltradas(filtro: {
  estado?: readonly EstadoFactura[]
  anunciante?: string
}): Route {
  return estadoTablaFacturas.serializar(RUTA_FACTURAS, {
    estado: filtro.estado?.length ? [...filtro.estado] : null,
    anunciante: filtro.anunciante ? [filtro.anunciante] : null,
  }) as Route
}

// ── Cartera ──────────────────────────────────────────────────────────────────

/** `?corte=YYYY-MM-DD`; sin él (o futuro), hoy. */
export const parsersCartera = { corte: parseAsDia }

/** Servidor: el corte pedido en la URL (o `null`). */
export const cargarCorteCartera = createLoader(parsersCartera)

/** El corte efectivo: el de la URL si no es futuro; si no, hoy (`hoy` en Bogotá). */
export function corteEfectivo(corte: string | null, hoy: string): string {
  return corte && corte <= hoy ? corte : hoy
}

/** La cartera a una fecha de corte (enlaces y el reporte). */
export function rutaCartera(corte: string | null = null): Route {
  return (corte ? `${RUTA_CARTERA}?corte=${corte}` : RUTA_CARTERA) as Route
}
