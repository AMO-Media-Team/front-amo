/**
 * Disputas de las asignaciones de un medio (ADM-002: historial de disputas en
 * su ficha), módulo puro: orden, resumen y lo que pasó con la asignación. El
 * detalle, el hilo y la resolución viven en la ficha de cada disputa
 * (`/operacion/disputas/{id}`).
 */
import {
  ESTADOS_ASIGNACION,
  type EstadoDisputa,
  PARTES_DISPUTA,
} from "@/features/operacion/estados"
import { formatearFecha } from "@/lib/format"

import type { DisputaDelMedio } from "./tipos"

const ABIERTAS: readonly EstadoDisputa[] = ["ABIERTA", "EN_REVISION"]

export function estaAbierta(estado: EstadoDisputa): boolean {
  return ABIERTAS.includes(estado)
}

/**
 * Primero las abiertas, la más antigua arriba (es la que más espera); después
 * las cerradas, de la más reciente a la más antigua.
 */
export function ordenarDisputas<
  T extends Pick<DisputaDelMedio, "id" | "estado" | "creadaAt">,
>(disputas: readonly T[]): T[] {
  return [...disputas].sort((a, b) => {
    const abiertaA = estaAbierta(a.estado)
    const abiertaB = estaAbierta(b.estado)
    if (abiertaA !== abiertaB) return abiertaA ? -1 : 1
    const porFecha = abiertaA
      ? a.creadaAt.localeCompare(b.creadaAt)
      : b.creadaAt.localeCompare(a.creadaAt)
    return porFecha || a.id.localeCompare(b.id)
  })
}

export interface ResumenDisputas {
  total: number
  abiertas: number
  resueltas: number
  descartadas: number
}

export function resumirDisputas(
  disputas: readonly Pick<DisputaDelMedio, "estado">[]
): ResumenDisputas {
  const contarSi = (filtro: (estado: EstadoDisputa) => boolean) =>
    disputas.filter((disputa) => filtro(disputa.estado)).length
  return {
    total: disputas.length,
    abiertas: contarSi(estaAbierta),
    resueltas: contarSi((estado) => estado === "RESUELTA"),
    descartadas: contarSi((estado) => estado === "DESCARTADA"),
  }
}

/** «Abierta por el anunciante el 3 de oct de 2026 · cerrada el 9 de oct de 2026». */
export function textoAperturaDisputa(
  disputa: Pick<DisputaDelMedio, "parte" | "creadaAt" | "resueltaAt">
): string {
  const cierre = disputa.resueltaAt
    ? ` · cerrada el ${formatearFecha(disputa.resueltaAt)}`
    : ""
  return `Abierta por ${PARTES_DISPUTA[disputa.parte]} el ${formatearFecha(disputa.creadaAt)}${cierre}`
}

/** Qué pasó con la asignación: en qué estado estaba al abrirla o cómo quedó. */
export function textoEfectoDisputa(
  disputa: Pick<DisputaDelMedio, "estado" | "estadoOrigen" | "estadoResultante">
): string {
  const origen = ESTADOS_ASIGNACION[disputa.estadoOrigen].etiqueta
  switch (disputa.estado) {
    case "ABIERTA":
    case "EN_REVISION":
      return `La asignación estaba en «${origen}» al abrirla; no se verifica ni se liquida hasta resolverla.`
    case "RESUELTA":
      return disputa.estadoResultante
        ? `La asignación quedó en «${ESTADOS_ASIGNACION[disputa.estadoResultante].etiqueta}».`
        : "Se resolvió."
    case "DESCARTADA":
      return `Se descartó: la asignación volvió a «${origen}».`
  }
}
