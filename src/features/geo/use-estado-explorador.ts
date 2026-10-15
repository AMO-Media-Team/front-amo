"use client"

import { useQueryStates } from "nuqs"
import { useCallback, useMemo, useState } from "react"

import { type RangoFechas, serializarFecha } from "@/lib/fechas"

import { parsersMapa, rangoDelMapa, rangoParaUrl } from "./estado-url"
import {
  admitePor100k,
  type MetricaGeo,
  metricaDisponibleEn,
  resolverMetrica,
} from "./metricas"
import { type EstadoNivel, normalizarEstadoNivel } from "./niveles"
import type { ConsultaMapaGeo } from "./tipos"

export interface EstadoExplorador {
  readonly nivel: EstadoNivel
  readonly metrica: MetricaGeo | null
  readonly rango: RangoFechas
  readonly consulta: ConsultaMapaGeo | null
  /** Vista "por 100 mil habitantes" (solo si la métrica y el nivel la admiten). */
  readonly por100k: boolean
  readonly admitePor100k: boolean
  /** Modo mapa de calor (solo con puntos reales). */
  readonly calor: boolean
  readonly admiteCalor: boolean
  irA(destino: EstadoNivel): void
  cambiarMetrica(metrica: MetricaGeo): void
  cambiarRango(rango: RangoFechas): void
  cambiarPor100k(activo: boolean): void
  cambiarCalor(activo: boolean): void
}

/**
 * Estado del explorador: la URL (nuqs) es la fuente de verdad. Nivel,
 * departamento, métrica y periodo se escriben con `history: push` para que
 * "Atrás" deshaga la última navegación; las vistas, con `replace`.
 */
export function useEstadoExplorador(
  metricasPermitidas: readonly MetricaGeo[],
  /** Métricas con puntos de calor que el usuario puede leer. */
  metricasCalor: readonly MetricaGeo[]
): EstadoExplorador {
  const [url, fijar] = useQueryStates(parsersMapa, {
    history: "push",
    scroll: false,
  })
  // Un "ahora" estable por montaje: los presets no cambian a mitad de sesión.
  const [ahora] = useState(() => new Date())

  const nivel = useMemo(
    () => normalizarEstadoNivel(url.nivel, url.depto),
    [url.nivel, url.depto]
  )
  const metrica = resolverMetrica(nivel.nivel, url.metrica, metricasPermitidas)
  const rango = useMemo(
    () => rangoDelMapa(url.desde, url.hasta, ahora),
    [url.desde, url.hasta, ahora]
  )

  const consulta = useMemo<ConsultaMapaGeo | null>(
    () =>
      metrica
        ? {
            nivel: nivel.nivel,
            metrica,
            desde: serializarFecha(rango.desde),
            hasta: serializarFecha(rango.hasta),
            departamento: nivel.departamento,
          }
        : null,
    [metrica, nivel, rango]
  )

  const conPor100k = metrica !== null && admitePor100k(nivel.nivel, metrica)
  const conCalor = metrica !== null && metricasCalor.includes(metrica)

  const irA = useCallback(
    (destino: EstadoNivel) => {
      const conservarMetrica =
        url.metrica !== null && metricaDisponibleEn(url.metrica, destino.nivel)
      void fijar({
        nivel: destino.nivel,
        depto: destino.departamento,
        metrica: conservarMetrica ? url.metrica : null,
      })
    },
    [fijar, url.metrica]
  )

  const cambiarMetrica = useCallback(
    (nueva: MetricaGeo) => void fijar({ metrica: nueva }),
    [fijar]
  )

  const cambiarRango = useCallback(
    (nuevo: RangoFechas) => void fijar(rangoParaUrl(nuevo, ahora)),
    [fijar, ahora]
  )

  const cambiarPor100k = useCallback(
    (activo: boolean) =>
      void fijar({ por100k: activo || null }, { history: "replace" }),
    [fijar]
  )

  const cambiarCalor = useCallback(
    (activo: boolean) =>
      void fijar({ calor: activo || null }, { history: "replace" }),
    [fijar]
  )

  return {
    nivel,
    metrica,
    rango,
    consulta,
    por100k: conPor100k && url.por100k,
    admitePor100k: conPor100k,
    calor: conCalor && url.calor,
    admiteCalor: conCalor,
    irA,
    cambiarMetrica,
    cambiarRango,
    cambiarPor100k,
    cambiarCalor,
  }
}
