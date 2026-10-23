/**
 * Estado en la URL del listado «Mis campañas» (módulo puro, lo comparten la
 * página y la tabla): búsqueda por nombre o marca, filtro por estado, orden y
 * página. `?estado=ACTIVA` es también el destino de los enlaces del inicio.
 */
import {
  definirEstadoTabla,
  type EstadoTabla,
  filtroDeOpciones,
} from "@/components/data-table/estado-url"
import { Constants } from "@/types/database.types"

export const CAMPOS_ORDEN_MIS_CAMPANAS = [
  "nombre",
  "inicio",
  "fin",
  "presupuesto",
  "estado",
  "creado",
] as const

export const estadoTablaMisCampanas = definirEstadoTabla({
  camposOrden: CAMPOS_ORDEN_MIS_CAMPANAS,
  ordenPorDefecto: { campo: "creado", descendente: true },
  filtros: {
    estado: filtroDeOpciones(Constants.public.Enums.campana_estado),
  },
})

export type EstadoTablaMisCampanas = EstadoTabla<typeof estadoTablaMisCampanas>
