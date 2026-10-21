/**
 * Regla 1 — Variación significativa y su causa principal. Para los KPI de
 * volumen, si |variación| ≥ umbral con muestra suficiente, descompone el delta
 * de forma aditiva por departamento y por plataforma: la causa es el grupo que
 * aporta al menos el 30 % del cambio en la misma dirección.
 */
import type { FilaKpi } from "@/components/kpi/tipos"
import { rutaExplorador } from "@/features/geo/rutas"
import {
  formatearCompacto,
  formatearCOPCompacto,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"

import { METRICA_MAPA } from "../rutas"
import {
  type DesgloseVariacion,
  type EntradaInsights,
  type FilaDesglose,
  type Insight,
  KPIS_VARIACION,
  type KpiVariacion,
} from "../tipos"

/** Sujeto de la frase (con artículo y número gramatical correctos). */
const SUJETOS: Readonly<
  Record<KpiVariacion, { sujeto: string; plural: boolean }>
> = {
  gmv_verificado: { sujeto: "El GMV verificado", plural: false },
  gmv_comprometido: { sujeto: "El GMV comprometido", plural: false },
  negocios_cerrados: { sujeto: "Los negocios cerrados", plural: true },
  alcance_total: { sujeto: "El alcance total", plural: false },
}

function verbo(sube: boolean, plural: boolean): string {
  if (sube) return plural ? "subieron" : "subió"
  return plural ? "bajaron" : "bajó"
}

/** Código DANE de departamento (el explorador solo abre esos). */
const CODIGO_DEPARTAMENTO = /^\d{2}$/

/** Participación mínima en el cambio para nombrar a un grupo como causa. */
export const UMBRAL_CAUSA = 0.3
const PRACTICAMENTE_TODO = 0.995

const comparador = new Intl.Collator("es", { sensitivity: "base" })

export interface Causa {
  fila: FilaDesglose
  /** Fracción del cambio total que explica (0–1). */
  participacion: number
}

/**
 * Grupo con mayor contribución al cambio en la misma dirección que el total.
 * Empates: por nombre, para que el texto no cambie entre renders.
 */
export function causaPrincipal(
  filas: readonly FilaDesglose[] | undefined,
  deltaTotal: number
): Causa | null {
  if (!filas?.length || deltaTotal === 0) return null
  const candidatas = filas
    .map((fila) => ({ fila, delta: fila.valor - fila.valorAnterior }))
    .filter(({ delta }) => Math.sign(delta) === Math.sign(deltaTotal))
    .sort(
      (a, b) =>
        Math.abs(b.delta) - Math.abs(a.delta) ||
        comparador.compare(a.fila.nombre, b.fila.nombre)
    )
  const mejor = candidatas[0]
  if (!mejor) return null
  const participacion = Math.abs(mejor.delta) / Math.abs(deltaTotal)
  return participacion >= UMBRAL_CAUSA
    ? { fila: mejor.fila, participacion: Math.min(participacion, 1) }
    : null
}

function formatearCifra(fila: FilaKpi, valor: number): string {
  if (fila.unidad === "COP") return formatearCOPCompacto(valor)
  if (fila.unidad === "personas") return formatearCompacto(valor)
  return formatearNumero(valor)
}

function textoParticipacion(participacion: number): string {
  return participacion >= PRACTICAMENTE_TODO
    ? "explica prácticamente todo el cambio"
    : `explica el ${formatearPorcentaje(participacion, 0)} del cambio`
}

function textoAporte(participacion: number): string {
  return participacion >= PRACTICAMENTE_TODO
    ? "aporta prácticamente todo"
    : `aporta el ${formatearPorcentaje(participacion, 0)}`
}

function textoCausa(
  desglose: DesgloseVariacion | undefined,
  zona: Causa | null,
  plataforma: Causa | null
): string {
  // Las dos descomposiciones son independientes: se nombran por separado para
  // no insinuar que la plataforma explica el cambio dentro de esa zona.
  if (zona && plataforma) {
    return ` ${zona.fila.nombre} ${textoParticipacion(zona.participacion)}; por plataforma, ${plataforma.fila.nombre} ${textoAporte(plataforma.participacion)}.`
  }
  const unica = zona ?? plataforma
  if (unica)
    return ` ${unica.fila.nombre} ${textoParticipacion(unica.participacion)}.`
  const hayDesglose = Boolean(
    desglose?.departamento?.length || desglose?.plataforma?.length
  )
  return hayDesglose
    ? ` El cambio es generalizado: ninguna zona ni plataforma explica por sí sola el ${formatearPorcentaje(UMBRAL_CAUSA, 0)}.`
    : ""
}

function nAnterior(fila: FilaKpi): number | null {
  if (fila.n_anterior != null) return fila.n_anterior
  // En los conteos, el valor anterior es su propia muestra.
  return fila.unidad === "conteo" ? fila.valor_anterior : null
}

function muestraSuficiente(fila: FilaKpi, minimo: number): boolean {
  const anterior = nAnterior(fila)
  return (fila.n ?? 0) >= minimo && (anterior === null || anterior >= minimo)
}

function insightDeKpi(
  entrada: EntradaInsights,
  kpi: KpiVariacion
): Insight | null {
  const fila = entrada.kpis.find((k) => k.kpi === kpi)
  if (
    !fila ||
    fila.valor === null ||
    fila.valor_anterior === null ||
    fila.valor_anterior === 0
  ) {
    return null
  }
  const deltaTotal = fila.valor - fila.valor_anterior
  const variacion = fila.variacion ?? deltaTotal / Math.abs(fila.valor_anterior)
  if (Math.abs(variacion) < entrada.config.umbralVariacion) return null
  if (!muestraSuficiente(fila, entrada.config.nMinimo)) return null

  const desglose = entrada.desgloses?.[kpi]
  const zona = causaPrincipal(desglose?.departamento, deltaTotal)
  const plataforma = causaPrincipal(desglose?.plataforma, deltaTotal)
  const sube = variacion > 0
  const { sujeto, plural } = SUJETOS[kpi]

  return {
    id: `variacion-${kpi}`,
    regla: 1,
    severidad: sube ? "positivo" : "atencion",
    titulo: `${sujeto} ${verbo(sube, plural)} ${formatearPorcentaje(Math.abs(variacion), 1)}`,
    detalle:
      `Pasó de ${formatearCifra(fila, fila.valor_anterior)} en el periodo anterior a ${formatearCifra(fila, fila.valor)}.` +
      textoCausa(desglose, zona, plataforma),
    metrica: kpi,
    valor: variacion,
    magnitud: Math.abs(variacion),
    accion: accionMapa(kpi, zona, entrada.periodo),
  }
}

/** El explorador abre el departamento que explica el cambio (si lo hay). */
function accionMapa(
  kpi: KpiVariacion,
  zona: Causa | null,
  periodo: EntradaInsights["periodo"]
): Insight["accion"] {
  const depto =
    zona && CODIGO_DEPARTAMENTO.test(zona.fila.clave) ? zona.fila : null
  return {
    etiqueta: depto
      ? `Explorar ${depto.nombre} en el mapa`
      : "Explorar en el mapa",
    href: rutaExplorador({
      metrica: METRICA_MAPA[kpi],
      departamento: depto?.clave,
      periodo,
    }),
  }
}

export function reglaVariacion(entrada: EntradaInsights): Insight[] {
  return KPIS_VARIACION.flatMap((kpi) => insightDeKpi(entrada, kpi) ?? [])
}
