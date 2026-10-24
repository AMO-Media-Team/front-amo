/**
 * Corrección de una métrica aprobada (ADM-008 c2; módulo puro): los valores
 * con que abre el formulario, las reglas de coherencia con que se valida (las
 * mismas de la carga del medio y de la BD) y lo que se manda a
 * `corregir_metrica_srv`: solo lo que cambió, para que la bitácora diga
 * exactamente qué se corrigió.
 */
import { separarFechaHora } from "@/features/asistente-oferta/instantes"
import { numeroAEntrada } from "@/features/configuracion/numeros"
import {
  CAMPOS,
  camposMetricas,
  COLUMNAS_METRICAS,
} from "@/features/ejecucion/campos-metricas"
import type {
  DatosMetricas,
  ReglasMetricas,
} from "@/features/ejecucion/schemas"
import type { CampoMetrica } from "@/features/ejecucion/tipos"

import type { ValoresCorreccion } from "./schemas"
import type { MetricaParaCorregir } from "./tipos"

/** Valores del formulario: las cifras y la fecha tal como están aprobadas. */
export function valoresInicialesCorreccion(
  metrica: MetricaParaCorregir
): ValoresCorreccion {
  const captura = separarFechaHora(metrica.fechaCorte)
  const textos = Object.fromEntries(
    CAMPOS.map((campo) => [campo, numeroAEntrada(metrica.valores[campo])])
  ) as Record<CampoMetrica, string>
  return {
    asignacionId: metrica.asignacionId,
    numero: metrica.numero,
    corte: metrica.corte,
    metricaId: metrica.metricaId,
    dia: captura.dia,
    hora: captura.hora,
    periodoDesde: metrica.periodo?.desde ?? "",
    periodoHasta: metrica.periodo?.hasta ?? "",
    ...textos,
    motivo: "",
  }
}

const MINUTO_MS = 60_000

/** El instante sin segundos (el formulario escribe la hora de minuto en minuto). */
function alMinuto(iso: string): string {
  const instante = new Date(iso).getTime()
  return Number.isFinite(instante)
    ? new Date(Math.floor(instante / MINUTO_MS) * MINUTO_MS).toISOString()
    : iso
}

/**
 * Reglas de la oferta con que se valida la corrección (INT-005). La
 * publicación se toma sin segundos: la fecha del corte se muestra sin ellos y,
 * si no se toca, no debe quedar «antes de cumplirse el corte» por esos
 * segundos (la BD vuelve a comprobarlo con los exactos si se cambia).
 */
export function reglasCorreccion(
  metrica: MetricaParaCorregir,
  ahora: Date
): ReglasMetricas {
  return {
    plataforma: metrica.plataforma,
    formato: metrica.formatoClave,
    corte: metrica.corte,
    fechaPublicacion: alMinuto(metrica.fechaPublicacion),
    otros: metrica.otros,
    tolerancia: metrica.tolerancia,
    ahora,
  }
}

export type ValoresRpcCorreccion = Record<string, number | string | null>

/**
 * Lo que cambió frente a la métrica aprobada, con los nombres de columna de
 * `corregir_metrica_srv`. Solo se comparan las cifras que pide la plataforma
 * y el formato (las del formulario); la fecha del corte solo entra si cambió
 * el día o la hora (el formulario no muestra segundos).
 */
export function cambiosCorreccion(
  metrica: MetricaParaCorregir,
  datos: DatosMetricas,
  escrito: { dia: string; hora: string }
): ValoresRpcCorreccion {
  const cambios: ValoresRpcCorreccion = {}
  const original = separarFechaHora(metrica.fechaCorte)
  if (original.dia !== escrito.dia || original.hora !== escrito.hora) {
    cambios.fecha_corte = datos.fechaCorte
  }
  for (const { clave } of camposMetricas(
    metrica.plataforma,
    metrica.formatoClave
  )) {
    const nuevo = datos.valores[clave]
    if (nuevo !== metrica.valores[clave]) {
      cambios[COLUMNAS_METRICAS[clave]] = nuevo
    }
  }
  return cambios
}
