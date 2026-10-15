import { ShieldAlert, SlidersHorizontal } from "lucide-react"

import type { FiltroFacetado } from "@/components/data-table/filtro-facetado"

import {
  ACCIONES,
  ACCIONES_BITACORA,
  ETIQUETAS_GRUPO,
  ORIGENES,
  ORIGENES_BITACORA,
} from "../catalogo"
import type { OpcionesFiltroBitacora } from "../tipos"
import { ICONOS_ACCION } from "./distintivos"

export type ClaveFiltroBitacora =
  "grupo" | "accion" | "actor" | "entidad" | "origen"

/**
 * Filtros facetados de la bitácora (tabla y línea de tiempo). Actores y
 * entidades son los que tienen actividad en el periodo, del más al menos activo.
 */
export function filtrosFacetadosBitacora(
  opciones: OpcionesFiltroBitacora
): FiltroFacetado<ClaveFiltroBitacora>[] {
  return [
    {
      clave: "grupo",
      titulo: "Categoría",
      opciones: [
        {
          valor: "SENSIBLES",
          etiqueta: ETIQUETAS_GRUPO.SENSIBLES,
          icono: ShieldAlert,
        },
        {
          valor: "CONFIGURACION",
          etiqueta: ETIQUETAS_GRUPO.CONFIGURACION,
          icono: SlidersHorizontal,
        },
      ],
    },
    {
      clave: "accion",
      titulo: "Acción",
      opciones: ACCIONES_BITACORA.map((accion) => ({
        valor: accion,
        etiqueta: ACCIONES[accion].etiqueta,
        icono: ICONOS_ACCION[accion],
      })),
    },
    {
      clave: "actor",
      titulo: "Actor",
      opciones: opciones.actores.map((actor) => ({
        valor: actor.id,
        etiqueta: actor.nombre,
        color: actor.color ?? undefined,
      })),
    },
    {
      clave: "entidad",
      titulo: "Entidad",
      opciones: opciones.entidades.map((entidad) => ({
        valor: entidad.entidad,
        etiqueta: entidad.nombre,
      })),
    },
    {
      clave: "origen",
      titulo: "Origen",
      opciones: ORIGENES_BITACORA.map((origen) => ({
        valor: origen,
        etiqueta: ORIGENES[origen].etiqueta,
      })),
    },
  ]
}
