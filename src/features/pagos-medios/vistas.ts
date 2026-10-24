/**
 * Estado de `/finanzas/pagos` en la URL (módulo puro, mismos parsers en el
 * servidor y en el cliente): la vista (`?vista=por-pagar|dispersiones`) y la
 * tabla de cada una, y la tabla de la ficha de un archivo de pagos.
 */
import { createLoader, parseAsStringLiteral } from "nuqs/server"

import {
  definirEstadoTabla,
  type EstadoTabla,
  filtroDeOpciones,
} from "@/components/data-table/estado-url"
import { Constants } from "@/types/database.types"

import { CAMPOS_ORDEN_POR_PAGAR, ESTADOS_PREPARACION } from "./preparacion"
import { VISTAS_PAGOS_MEDIOS, type VistaPagosMedios } from "./rutas"

export const VISTA_POR_DEFECTO: VistaPagosMedios = "por-pagar"

export const cargarVistaPagos = createLoader({
  vista:
    parseAsStringLiteral(VISTAS_PAGOS_MEDIOS).withDefault(VISTA_POR_DEFECTO),
})

export const VISTAS: Readonly<
  Record<VistaPagosMedios, { titulo: string; descripcion: string }>
> = {
  "por-pagar": {
    titulo: "Por pagar",
    descripcion:
      "Liquidaciones aprobadas: genera el archivo para el banco y registra cada pago con su soporte.",
  },
  dispersiones: {
    titulo: "Archivos de pagos",
    descripcion:
      "Los archivos que se generaron para el banco, con sus liquidaciones.",
  },
}

/** «Por pagar»: las más antiguas primero (llevan más tiempo esperando). */
export const estadoTablaPorPagar = definirEstadoTabla({
  camposOrden: CAMPOS_ORDEN_POR_PAGAR,
  ordenPorDefecto: { campo: "aprobada", descendente: false },
  filtros: {
    preparacion: filtroDeOpciones(ESTADOS_PREPARACION),
    metodo: filtroDeOpciones(Constants.public.Enums.metodo_pago),
  },
})

export type EstadoTablaPorPagar = EstadoTabla<typeof estadoTablaPorPagar>

export const CAMPOS_ORDEN_DISPERSIONES = ["fecha", "total", "cantidad"] as const

export type CampoOrdenDispersiones = (typeof CAMPOS_ORDEN_DISPERSIONES)[number]

/** Historial de archivos: el más reciente primero. La búsqueda es por medio. */
export const estadoTablaDispersiones = definirEstadoTabla({
  camposOrden: CAMPOS_ORDEN_DISPERSIONES,
  ordenPorDefecto: { campo: "fecha", descendente: true },
  filtros: {},
})

export type EstadoTablaDispersiones = EstadoTabla<
  typeof estadoTablaDispersiones
>

/** Estados que puede tener una liquidación que sigue en un archivo de pagos. */
export const ESTADOS_EN_ARCHIVO = ["APROBADA", "PAGADA", "ANULADA"] as const

export const CAMPOS_ORDEN_LIQUIDACIONES_DISPERSION = [
  "medio",
  "neto",
  "estado",
] as const

export type CampoOrdenLiquidacionesDispersion =
  (typeof CAMPOS_ORDEN_LIQUIDACIONES_DISPERSION)[number]

/** Liquidaciones de un archivo: primero las que faltan por pagar. */
export const estadoTablaLiquidacionesDispersion = definirEstadoTabla({
  camposOrden: CAMPOS_ORDEN_LIQUIDACIONES_DISPERSION,
  ordenPorDefecto: { campo: "estado", descendente: false },
  filtros: { estado: filtroDeOpciones(ESTADOS_EN_ARCHIVO) },
})

export type EstadoTablaLiquidacionesDispersion = EstadoTabla<
  typeof estadoTablaLiquidacionesDispersion
>
