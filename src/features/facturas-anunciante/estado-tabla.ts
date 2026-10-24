/**
 * Estado en la URL del listado de facturas del anunciante (módulo puro, lo
 * comparten la página y la tabla): búsqueda por número o CUFE, filtros por
 * estado (`?estado=VENCIDA`) y campaña (`?campana=`, contrato de
 * `rutaFacturasDeCampana`), orden y página. El periodo de emisión
 * (`?periodo=` o `?desde=&hasta=`) lo lleva su propio selector con los
 * parsers de `@/features/operacion/periodo`.
 */
import {
  definirEstadoTabla,
  type EstadoTabla,
  filtroDeIds,
  filtroDeOpciones,
} from "@/components/data-table/estado-url"

import { ORDEN_ESTADOS_VISIBLES } from "./presentacion"

export const CAMPOS_ORDEN_FACTURAS = [
  "emision",
  "vencimiento",
  "total",
  "saldo",
] as const

export type CampoOrdenFacturas = (typeof CAMPOS_ORDEN_FACTURAS)[number]

export const estadoTablaFacturas = definirEstadoTabla({
  camposOrden: CAMPOS_ORDEN_FACTURAS,
  ordenPorDefecto: { campo: "emision", descendente: true },
  filtros: {
    estado: filtroDeOpciones(ORDEN_ESTADOS_VISIBLES),
    campana: filtroDeIds(),
  },
})

export type EstadoTablaFacturas = EstadoTabla<typeof estadoTablaFacturas>
