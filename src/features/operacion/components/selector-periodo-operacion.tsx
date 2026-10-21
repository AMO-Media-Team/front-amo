"use client"

import { useQueryStates } from "nuqs"
import { useTransition } from "react"

import { parseAsPagina } from "@/components/data-table/estado-url"
import {
  type OpcionPeriodo,
  opcionesDePresets,
  SelectorPeriodo,
} from "@/components/filtros/selector-periodo"
import {
  type PresetAutomatico,
  PRESETS_RANGO,
  serializarFecha,
} from "@/lib/fechas"
import { cn } from "@/lib/utils"

import {
  ETIQUETA_SIN_PERIODO,
  etiquetaPeriodo,
  parsersPeriodo,
  rangoOpcional,
} from "../periodo"

/** Opción que quita el filtro: el listado vuelve a abarcar todo el historial. */
const SIN_PERIODO = "todo"
type Opcion = PresetAutomatico | typeof SIN_PERIODO

const OPCIONES: readonly OpcionPeriodo<Opcion>[] = [
  { valor: SIN_PERIODO, etiqueta: ETIQUETA_SIN_PERIODO },
  ...opcionesDePresets(
    PRESETS_RANGO.filter(
      (preset): preset is PresetAutomatico => preset !== "personalizado"
    )
  ),
]

const parsers = { ...parsersPeriodo, pagina: parseAsPagina }

/**
 * Periodo opcional de un listado de operación (por fecha de creación). A
 * diferencia de Auditoría, por defecto no filtra ("Todo el historial"); los
 * presets y el calendario son los mismos (`@/lib/fechas`, hora de Bogotá).
 * Escribe en la URL y vuelve a la primera página de la tabla.
 */
export function SelectorPeriodoOperacion({
  className,
}: {
  className?: string
}) {
  const [cargando, iniciar] = useTransition()
  const [valores, fijar] = useQueryStates(parsers, {
    shallow: false,
    scroll: false,
    startTransition: iniciar,
  })
  const rango = rangoOpcional(valores)
  const etiqueta = etiquetaPeriodo(rango)
  const opcionActiva: Opcion | null =
    rango === null
      ? SIN_PERIODO
      : rango.preset === "personalizado"
        ? null
        : rango.preset

  return (
    <SelectorPeriodo
      rango={rango}
      etiqueta={etiqueta}
      nombreAccesible={`Creadas en: ${etiqueta}`}
      tituloPanel="Elegir el periodo de creación"
      nota="Filtra por la fecha en que se creó la asignación."
      opciones={OPCIONES}
      opcionActiva={opcionActiva}
      onOpcion={(opcion) =>
        void fijar({
          periodo: opcion === SIN_PERIODO ? null : opcion,
          desde: null,
          hasta: null,
          pagina: null,
        })
      }
      onRango={(elegido) =>
        void fijar({
          periodo: "personalizado",
          desde: serializarFecha(elegido.desde),
          hasta: serializarFecha(elegido.hasta),
          pagina: null,
        })
      }
      describirRango={etiquetaPeriodo}
      cargando={cargando}
      // Con filtro activo el botón se distingue del estado por defecto.
      className={cn(rango && "border-primary/40", className)}
    />
  )
}
