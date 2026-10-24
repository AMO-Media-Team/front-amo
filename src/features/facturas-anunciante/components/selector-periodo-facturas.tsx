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
  ETIQUETA_SIN_PERIODO,
  etiquetaPeriodo,
  parsersPeriodo,
  rangoOpcional,
} from "@/features/operacion/periodo"
import {
  type PresetAutomatico,
  PRESETS_RANGO,
  serializarFecha,
} from "@/lib/fechas"
import { cn } from "@/lib/utils"

/** Opción que quita el filtro: vuelve todo el historial de facturas. */
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
 * Buscador por fechas de las facturas (ANU-013 c1): filtra por la fecha de
 * EMISIÓN. Por defecto no filtra («Todo el historial»); un rango del
 * calendario queda en la URL como `?desde=&hasta=` (con `periodo=personalizado`)
 * y vuelve a la primera página de la tabla.
 */
export function SelectorPeriodoFacturas({ className }: { className?: string }) {
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
      nombreAccesible={`Emitidas en: ${etiqueta}`}
      tituloPanel="Elegir las fechas de emisión"
      nota="Filtra por la fecha en que se emitió la factura."
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
