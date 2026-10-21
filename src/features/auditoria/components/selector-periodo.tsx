"use client"

import { useQueryStates } from "nuqs"
import { useTransition } from "react"

import { parseAsPagina } from "@/components/data-table/estado-url"
import {
  opcionesDePresets,
  SelectorPeriodo as SelectorPeriodoBase,
} from "@/components/filtros/selector-periodo"
import {
  PRESET_POR_DEFECTO,
  type PresetAutomatico,
  PRESETS_RANGO,
  serializarFecha,
} from "@/lib/fechas"

import { etiquetaRango, parsersPeriodo, rangoDeValores } from "../periodo"

const OPCIONES = opcionesDePresets(
  PRESETS_RANGO.filter(
    (preset): preset is PresetAutomatico => preset !== "personalizado"
  )
)

const parsers = { ...parsersPeriodo, pagina: parseAsPagina }

/**
 * Periodo de la página en la URL (`?periodo=`, o `?desde=&hasta=`), con el
 * contrato de `../periodo` que comparten Auditoría, Accesos y Reportes. No
 * desplaza la vista; el servidor vuelve a consultar y la página conserva lo
 * anterior mientras llega lo nuevo. Cambiar el periodo vuelve a la primera
 * página de la tabla.
 */
export function SelectorPeriodo({ className }: { className?: string }) {
  const [cargando, iniciar] = useTransition()
  const [valores, fijar] = useQueryStates(parsers, {
    shallow: false,
    scroll: false,
    startTransition: iniciar,
  })
  const rango = rangoDeValores(valores)

  return (
    <SelectorPeriodoBase
      rango={rango}
      etiqueta={etiquetaRango(rango)}
      opciones={OPCIONES}
      opcionActiva={rango.preset === "personalizado" ? null : rango.preset}
      onOpcion={(preset) =>
        void fijar({
          // El preset por defecto deja la URL limpia.
          periodo: preset === PRESET_POR_DEFECTO ? null : preset,
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
      describirRango={etiquetaRango}
      cargando={cargando}
      className={className}
    />
  )
}
