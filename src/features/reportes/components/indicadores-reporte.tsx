"use client"

import { RejillaKpi } from "@/components/kpi/rejilla-kpi"
import { TarjetaKpi } from "@/components/kpi/tarjeta-kpi"

import type { IndicadorReporte } from "../indicadores"
import { rejillaIndicadores } from "../vista"
import { ICONOS_INDICADOR } from "./iconos"

/**
 * Indicadores de cabecera del reporte: cifra animada, variación frente al
 * periodo (o corte) anterior con el color según su sentido (o por qué no se
 * compara), definición en
 * lenguaje llano y aviso de muestra insuficiente. La rejilla depende de
 * cuántas tarjetas hay (`rejillaIndicadores`).
 */
export function IndicadoresReporte({
  indicadores,
  etiquetaComparacion,
  textoSinDatos,
}: {
  indicadores: readonly IndicadorReporte[]
  /** "frente al mes anterior (1–31 ago 2026)". */
  etiquetaComparacion: string | null
  /** Qué decir de un indicador sin valor (los reportes a fecha de corte no tienen periodo). */
  textoSinDatos?: string
}) {
  if (indicadores.length === 0) return null
  const rejilla = rejillaIndicadores(indicadores.length)
  return (
    <RejillaKpi
      etiqueta="Indicadores del reporte"
      columnas={rejilla.columnas}
      className={rejilla.className}
    >
      {indicadores.map((ind, indice) => (
        <TarjetaKpi
          key={ind.clave}
          titulo={ind.titulo}
          valor={ind.valor}
          unidad={ind.unidad}
          valorAnterior={ind.valorAnterior}
          variacion={ind.variacion}
          sentido={ind.sentido}
          serie={ind.serie}
          n={ind.n}
          nMinimo={ind.nMinimo ?? undefined}
          definicion={ind.definicion ?? undefined}
          icono={ind.icono ? ICONOS_INDICADOR[ind.icono] : undefined}
          etiquetaComparacion={etiquetaComparacion ?? undefined}
          sinComparativo={ind.sinComparativo ?? undefined}
          textoSinDatos={textoSinDatos}
          indice={indice}
        />
      ))}
    </RejillaKpi>
  )
}
