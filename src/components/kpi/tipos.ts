/**
 * Forma común de las RPC de tarjetas KPI (`kpi_fila`, docs/modelo-datos.md
 * §5.9): `kpis_admin`, `kpis_anunciante`, `kpis_medio`, `metricas_accesos`.
 */

/** `factor`: multiplicador adimensional (calidad del medio, 1,15 ×). */
export type UnidadKpi = "COP" | "%" | "h" | "conteo" | "personas" | "factor"

/** Hacia dónde es "mejor" que se mueva el indicador (colorea la variación). */
export type SentidoKpi = "mayor" | "menor" | "neutro"

export interface FilaKpi {
  kpi: string
  valor: number | null
  valor_anterior: number | null
  /** (valor − anterior) / anterior; null si el anterior es 0 o null. */
  variacion: number | null
  n: number | null
  /**
   * n del periodo anterior. `kpi_fila` aún no lo devuelve: sin él, las reglas
   * que exigen n mínimo en ambos periodos solo pueden verificar el actual.
   */
  n_anterior?: number | null
  unidad: UnidadKpi | string
  /** Sparkline: un punto por día (≤ 31 días) o por semana ISO. */
  serie: readonly (number | null)[] | null
}
