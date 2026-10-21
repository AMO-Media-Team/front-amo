"use client"

import {
  opcionesDePresets,
  SelectorPeriodo as SelectorPeriodoBase,
} from "@/components/filtros/selector-periodo"
import { rangoDesdePreset, type RangoFechas } from "@/lib/fechas"

import {
  DIAS_MAXIMOS_RANGO,
  ETIQUETAS_PRESET_MAPA,
  PRESETS_MAPA,
  type PresetMapa,
} from "../estado-url"
import { formatearPeriodo } from "../formato"

interface SelectorPeriodoProps {
  rango: RangoFechas
  onCambiar: (rango: RangoFechas) => void
  /**
   * Barra compacta: en un teléfono solo cabe el ícono; desde 30 rem de mapa
   * (tabletas, ventanas estrechas) el periodo vuelve a leerse.
   */
  compacto?: boolean
  className?: string
}

const OPCIONES = opcionesDePresets(PRESETS_MAPA)

/** La API ignora en silencio un rango mayor: se avisa antes de aplicarlo. */
const LIMITE = {
  dias: DIAS_MAXIMOS_RANGO,
  mensaje: "Elige un periodo de máximo dos años",
}

function esPresetMapa(valor: string): valor is PresetMapa {
  return PRESETS_MAPA.includes(valor as PresetMapa)
}

const describir = (rango: Pick<RangoFechas, "desde" | "hasta">) =>
  formatearPeriodo(rango.desde, rango.hasta)

/** Periodo del mapa: presets frecuentes o un rango a medida en el calendario. */
export function SelectorPeriodo({
  rango,
  onCambiar,
  compacto = false,
  className,
}: SelectorPeriodoProps) {
  const preset = esPresetMapa(rango.preset) ? rango.preset : null

  return (
    <SelectorPeriodoBase
      apariencia="barra"
      rango={rango}
      etiqueta={preset ? ETIQUETAS_PRESET_MAPA[preset] : describir(rango)}
      // Siempre con fechas: «Últimos 30 días» no dice cuáles son.
      nombreAccesible={`Periodo: ${describir(rango)}`}
      claseEtiqueta={
        compacto
          ? "sr-only @min-[30rem]/mapa:not-sr-only @min-[30rem]/mapa:truncate"
          : "truncate"
      }
      opciones={OPCIONES}
      opcionActiva={preset}
      onOpcion={(elegido) => onCambiar(rangoDesdePreset(elegido))}
      onRango={onCambiar}
      describirRango={describir}
      limite={LIMITE}
      className={className}
    />
  )
}
