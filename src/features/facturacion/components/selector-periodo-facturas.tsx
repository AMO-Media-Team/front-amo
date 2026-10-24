"use client"

import { useQueryStates } from "nuqs"
import { useTransition } from "react"

import { parseAsPagina } from "@/components/data-table/estado-url"
import {
  type OpcionPeriodo,
  opcionesDePresets,
  SelectorPeriodo,
} from "@/components/filtros/selector-periodo"
import { etiquetaRango } from "@/features/auditoria/periodo"
import { parsearFecha, serializarFecha } from "@/lib/fechas"
import { cn } from "@/lib/utils"

import {
  atajoDePeriodo,
  extremosDePreset,
  parseAsDia,
  periodoEmision,
  PRESETS_EMISION,
  type PresetEmision,
} from "../listado"

const SIN_PERIODO = "todo"
type Opcion = PresetEmision | typeof SIN_PERIODO

const OPCIONES: readonly OpcionPeriodo<Opcion>[] = [
  { valor: SIN_PERIODO, etiqueta: "Todas las fechas" },
  ...opcionesDePresets(PRESETS_EMISION),
]

const parsers = { desde: parseAsDia, hasta: parseAsDia, pagina: parseAsPagina }

/**
 * Periodo de emisión del listado de facturas (`?desde=&hasta=`, días de
 * Bogotá). Por defecto no filtra; los atajos y el calendario escriben las dos
 * fechas y vuelven a la primera página. Los borradores no tienen emisión: con
 * un periodo elegido no aparecen.
 */
export function SelectorPeriodoFacturas({ className }: { className?: string }) {
  const [cargando, iniciar] = useTransition()
  const [valores, fijar] = useQueryStates(parsers, {
    shallow: false,
    scroll: false,
    startTransition: iniciar,
  })
  const periodo = periodoEmision(valores)
  const desde = periodo ? parsearFecha(periodo.desde) : null
  const hasta = periodo ? parsearFecha(periodo.hasta) : null
  const rango = desde && hasta ? { desde, hasta } : null
  const atajo = atajoDePeriodo(periodo)
  const etiqueta =
    atajo === SIN_PERIODO
      ? "Todas las fechas"
      : rango
        ? etiquetaRango({ preset: atajo ?? "personalizado", ...rango })
        : "Todas las fechas"

  return (
    <SelectorPeriodo
      rango={rango}
      etiqueta={etiqueta}
      nombreAccesible={`Emitidas: ${etiqueta}`}
      tituloPanel="Elegir el periodo de emisión"
      nota="Filtra por la fecha de emisión de la factura."
      opciones={OPCIONES}
      opcionActiva={atajo}
      onOpcion={(opcion) =>
        void fijar(
          opcion === SIN_PERIODO
            ? { desde: null, hasta: null, pagina: null }
            : { ...extremosDePreset(opcion), pagina: null }
        )
      }
      onRango={(elegido) =>
        void fijar({
          desde: serializarFecha(elegido.desde),
          hasta: serializarFecha(elegido.hasta),
          pagina: null,
        })
      }
      describirRango={etiquetaRango}
      cargando={cargando}
      className={cn(rango && "border-primary/40", className)}
    />
  )
}
