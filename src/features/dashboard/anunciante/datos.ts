/**
 * Transformaciones puras del panel del anunciante: cortes de
 * `desempeno_anunciante` (§7.2.6) a series, plataformas, ranking de medios y
 * resumen de cartera. Sin I/O ni React.
 */
import { NOMBRES_PLATAFORMA } from "@/features/dashboard/insights/textos"
import type { Plataforma } from "@/features/dashboard/insights/tipos"

import { ORDEN_PLATAFORMAS } from "../admin/datos"
import type { Granularidad } from "../periodo"
import { completarCubetas, cubetasDelRango, etiquetasPeriodos } from "../series"

/** Una fila de `desempeno_anunciante` (cualquier dimensión). */
export interface FilaDesempeno {
  clave: string
  nombre: string
  asignaciones: number
  /** Inversión verificada (valor bruto). */
  gmv: number
  alcance: number
  impresiones: number
  interacciones: number
  reproducciones: number
  clics: number
  cpm: number | null
  costoInteraccion: number | null
  engagement: number | null
  costoAlcance: number | null
  n: number
}

function filaVacia(clave: string): FilaDesempeno {
  return {
    clave,
    nombre: clave,
    asignaciones: 0,
    gmv: 0,
    alcance: 0,
    impresiones: 0,
    interacciones: 0,
    reproducciones: 0,
    clics: 0,
    cpm: null,
    costoInteraccion: null,
    engagement: null,
    costoAlcance: null,
    n: 0,
  }
}

// ── Tendencia ────────────────────────────────────────────────────────────────

export interface SerieDesempeno {
  granularidad: Granularidad
  etiquetas: string[]
  inversion: number[]
  alcance: number[]
}

/**
 * La dimensión `fecha` solo trae los días (≤ 31) o semanas ISO con negocios
 * verificados: se completa el eje con ceros para no esconder los huecos.
 */
export function serieDesempeno(
  filas: readonly FilaDesempeno[],
  desde: string,
  hasta: string
): SerieDesempeno {
  // Igual que `private.cubeta`: días hasta 31; si no, semanas ISO.
  const granularidad: Granularidad =
    diasEntre(desde, hasta) <= 31 ? "dia" : "semana"
  const cubetas = cubetasDelRango(desde, hasta)
  const completas = completarCubetas(
    cubetas,
    filas,
    (fila) => fila.clave,
    filaVacia
  )
  return {
    granularidad,
    etiquetas: etiquetasPeriodos(cubetas, granularidad),
    inversion: completas.map((fila) => fila.gmv),
    alcance: completas.map((fila) => fila.alcance),
  }
}

function diasEntre(desde: string, hasta: string): number {
  const inicio = Date.parse(`${desde}T00:00:00Z`)
  const fin = Date.parse(`${hasta}T00:00:00Z`)
  return Number.isFinite(inicio) && Number.isFinite(fin)
    ? Math.round((fin - inicio) / 86_400_000) + 1
    : 0
}

// ── Plataformas ──────────────────────────────────────────────────────────────

export interface DesempenoPlataforma extends FilaDesempeno {
  plataforma: Plataforma
}

function esPlataforma(valor: string): valor is Plataforma {
  return (ORDEN_PLATAFORMAS as readonly string[]).includes(valor)
}

/** Orden fijo (el color sigue a la plataforma) y nombre comercial. */
export function desempenoPorPlataforma(
  filas: readonly FilaDesempeno[]
): DesempenoPlataforma[] {
  const porClave = new Map(filas.map((fila) => [fila.clave, fila]))
  return ORDEN_PLATAFORMAS.flatMap((plataforma) => {
    const fila = porClave.get(plataforma)
    return fila && esPlataforma(fila.clave)
      ? [{ ...fila, plataforma, nombre: NOMBRES_PLATAFORMA[plataforma] }]
      : []
  })
}

// ── Ranking de medios ────────────────────────────────────────────────────────

export interface RankingMedios {
  /**
   * `engagement` si al menos `MINIMO_COMPARABLES` medios tienen muestra
   * suficiente; si no, `alcance` (una suma, que no exige muestra): comparar
   * tasas de grupos pequeños produce conclusiones falsas (docs/kpis.md §0.4).
   */
  criterio: "engagement" | "alcance"
  filas: FilaDesempeno[]
}

export const MINIMO_COMPARABLES = 3
export const TOPE_RANKING = 5

export function rankingMedios(
  filas: readonly FilaDesempeno[],
  nMinimo: number
): RankingMedios {
  const comparables = filas.filter(
    (fila) => fila.n >= nMinimo && fila.engagement !== null && fila.alcance > 0
  )
  if (comparables.length >= MINIMO_COMPARABLES) {
    return {
      criterio: "engagement",
      filas: [...comparables]
        .sort(
          (a, b) =>
            (b.engagement ?? 0) - (a.engagement ?? 0) ||
            a.nombre.localeCompare(b.nombre, "es")
        )
        .slice(0, TOPE_RANKING),
    }
  }
  return {
    criterio: "alcance",
    filas: filas
      .filter((fila) => fila.alcance > 0)
      .sort(
        (a, b) =>
          b.alcance - a.alcance || a.nombre.localeCompare(b.nombre, "es")
      )
      .slice(0, TOPE_RANKING),
  }
}

/**
 * "Bogotá, D.C., Bogotá" → "Bogotá, D.C.": la RPC nombra cada municipio con
 * su departamento, y el único cuyo nombre ya lleva coma (el distrito capital)
 * lo repetiría. "Boyacá, Boyacá" o "Sucre, Sucre" son municipios reales y se
 * dejan igual.
 */
export function etiquetaMunicipio(etiqueta: string): string {
  const partes = etiqueta.split(", ")
  const departamento = partes.at(-1) ?? ""
  return partes.length > 2 && partes[0] === departamento
    ? partes.slice(0, -1).join(", ")
    : etiqueta
}

/** Inversión por código DANE para el mini-mapa. */
export function inversionPorDepartamento(
  filas: readonly FilaDesempeno[]
): Record<string, number | null> {
  return Object.fromEntries(
    filas
      .filter((fila) => /^\d{2}$/.test(fila.clave) && fila.gmv > 0)
      .map((fila) => [fila.clave, fila.gmv])
  )
}

// ── Cartera ──────────────────────────────────────────────────────────────────

export type EstadoFacturaPendiente = "EMITIDA" | "PAGADA_PARCIAL" | "VENCIDA"

export const ESTADOS_PENDIENTES: readonly EstadoFacturaPendiente[] = [
  "EMITIDA",
  "PAGADA_PARCIAL",
  "VENCIDA",
]

export interface FacturaPendiente {
  id: string
  numero: string | null
  total: number
  saldo: number
  estado: EstadoFacturaPendiente
  /** 'YYYY-MM-DD'. */
  fechaVencimiento: string | null
}

export interface ResumenCartera {
  saldo: number
  vencido: number
  facturasVencidas: number
  facturas: (FacturaPendiente & { vencida: boolean })[]
}

export const FACTURAS_VISIBLES = 4

/** Vencida: así marcada o con la fecha de vencimiento antes de hoy. */
export function estaVencida(factura: FacturaPendiente, hoy: string): boolean {
  return (
    factura.estado === "VENCIDA" ||
    (factura.fechaVencimiento !== null && factura.fechaVencimiento < hoy)
  )
}

export function resumenCartera(
  facturas: readonly FacturaPendiente[],
  hoy: string
): ResumenCartera {
  const conSaldo = facturas
    .filter((factura) => factura.saldo > 0)
    .map((factura) => ({ ...factura, vencida: estaVencida(factura, hoy) }))
    .sort(
      (a, b) =>
        Number(b.vencida) - Number(a.vencida) ||
        (a.fechaVencimiento ?? "9999").localeCompare(
          b.fechaVencimiento ?? "9999"
        )
    )
  const vencidas = conSaldo.filter((factura) => factura.vencida)
  return {
    saldo: conSaldo.reduce((total, f) => total + f.saldo, 0),
    vencido: vencidas.reduce((total, f) => total + f.saldo, 0),
    facturasVencidas: vencidas.length,
    facturas: conSaldo.slice(0, FACTURAS_VISIBLES),
  }
}
