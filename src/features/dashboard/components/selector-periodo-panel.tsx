"use client"

import {
  opcionesDePresets,
  SelectorPeriodo,
} from "@/components/filtros/selector-periodo"

import {
  DIAS_MAXIMOS_PANEL,
  PRESETS_PANEL,
  rangoPanel,
  textoPeriodo,
  valoresParaPreset,
  valoresParaRango,
} from "../periodo"
import { ID_SELECTOR_PERIODO, usePeriodoPanel } from "./proveedor-periodo"

const OPCIONES = opcionesDePresets(PRESETS_PANEL)

const LIMITE = {
  dias: DIAS_MAXIMOS_PANEL,
  mensaje: "Elige un periodo de máximo dos años",
}

/**
 * Periodo del panel: presets de `@/lib/fechas` o un rango del calendario
 * (máximo dos años). Escribe en la URL; el panel se vuelve a calcular en el
 * servidor y lo anterior queda atenuado mientras tanto.
 */
export function SelectorPeriodoPanel({ className }: { className?: string }) {
  const { valores, porDefecto, fijar, actualizando } = usePeriodoPanel()
  const rango = rangoPanel(valores, porDefecto)

  return (
    <SelectorPeriodo
      id={ID_SELECTOR_PERIODO}
      rango={rango}
      etiqueta={textoPeriodo(rango)}
      opciones={OPCIONES}
      // Un preset fuera del selector (`hoy` en un enlace) no marca ninguna.
      opcionActiva={
        OPCIONES.find((opcion) => opcion.valor === rango.preset)?.valor ?? null
      }
      onOpcion={(preset) => fijar(valoresParaPreset(preset, porDefecto))}
      onRango={(elegido) => fijar(valoresParaRango(elegido))}
      describirRango={textoPeriodo}
      limite={LIMITE}
      cargando={actualizando}
      className={className}
    />
  )
}
