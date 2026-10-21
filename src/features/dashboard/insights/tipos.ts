/**
 * Contrato del motor de insights (docs/kpis.md §5). La entrada son datos ya
 * consultados por las RPC de analítica (docs/modelo-datos.md §5.9) y
 * adaptados por la página; el motor no hace I/O.
 */
import type { Route } from "next"

import type { FilaKpi } from "@/components/kpi/tipos"

export type Severidad = "critico" | "atencion" | "positivo" | "info"

export type Plataforma = "FACEBOOK" | "INSTAGRAM" | "TIKTOK"

export type NumeroRegla = 1 | 2 | 3 | 4 | 5 | 6

export interface AccionInsight {
  etiqueta: string
  href: Route
}

export interface Insight {
  id: string
  regla: NumeroRegla
  severidad: Severidad
  titulo: string
  detalle: string
  /** Clave del KPI al que se refiere (si aplica). */
  metrica?: string
  valor?: number
  /**
   * Relevancia normalizada (≈ 0–1) para ordenar dentro de una misma
   * severidad: variación relativa, puntos perdidos, proporción en juego…
   */
  magnitud: number
  accion?: AccionInsight
}

/** KPI cuya variación significativa se explica por zona y plataforma (regla 1). */
export const KPIS_VARIACION = [
  "gmv_verificado",
  "gmv_comprometido",
  "negocios_cerrados",
  "alcance_total",
] as const

export type KpiVariacion = (typeof KPIS_VARIACION)[number]

/** Valor de un grupo (departamento o plataforma) en ambos periodos. */
export interface FilaDesglose {
  clave: string
  nombre: string
  valor: number
  valorAnterior: number
}

export interface DesgloseVariacion {
  departamento?: readonly FilaDesglose[]
  plataforma?: readonly FilaDesglose[]
}

export interface ConteoPorGrupo {
  clave: string
  nombre: string
  cantidad: number
}

/** Asignaciones VENCIDA_SIN_PUBLICAR del periodo (regla 2). */
export interface VencidasPeriodo {
  total: number
  porDepartamento: readonly ConteoPorGrupo[]
  porMedio: readonly ConteoPorGrupo[]
}

/** `salud_medios` (segmento en_riesgo) + `medios_en_riesgo` (regla 3). */
export interface MediosEnRiesgo {
  cantidad: number
  gmvEnJuego: number
  /** GMV verificado de los últimos 90 días de toda la plataforma. */
  gmvVerificado90d: number | null
  top: readonly {
    id: string
    nombre: string
    departamento?: string | null
    gmv90d: number
  }[]
}

/** Fila de `mezcla_plataformas` (regla 4). */
export interface FilaMezcla {
  plataforma: Plataforma
  formatoClave: string
  formatoNombre: string
  asignaciones: number
  gmv: number
  cpmEfectivo: number | null
}

/** Métricas PENDIENTE con alerta de desviación o de múltiplo (regla 5). */
export interface MetricasAtipicas {
  total: number
  desviacion: number
  multiplo: number
  masAntiguaAt: Date | string | null
}

/** Acceso marcado como sospechoso en el periodo (regla 6). */
export interface AccesoSospechoso {
  usuarioId: string
  /** Rol de tipo ADMIN (personal interno). */
  esInterno: boolean
  paisIso2: string | null
  paisNombre?: string | null
  motivo: string | null
}

export interface ConfigInsights {
  /** `analitica.umbral_variacion` (0,15). */
  umbralVariacion: number
  /** `analitica.n_minimo_tasas` (20). */
  nMinimo: number
  /** `medios.dias_riesgo_sin_aceptar` (30). */
  diasRiesgoSinAceptar: number
  /** `medios.dias_actividad` (90). */
  diasActividad: number
}

export const CONFIG_INSIGHTS_POR_DEFECTO: ConfigInsights = {
  umbralVariacion: 0.15,
  nMinimo: 20,
  diasRiesgoSinAceptar: 30,
  diasActividad: 90,
}

export interface EntradaInsights {
  /** Rango consultado ('YYYY-MM-DD'); se conserva en los enlaces de acción. */
  periodo?: { desde: string; hasta: string }
  ahora: Date
  kpis: readonly FilaKpi[]
  desgloses?: Partial<Record<KpiVariacion, DesgloseVariacion>>
  vencidas?: VencidasPeriodo
  mediosEnRiesgo?: MediosEnRiesgo
  mezclaPlataformas?: readonly FilaMezcla[]
  metricasAtipicas?: MetricasAtipicas
  accesosSospechosos?: readonly AccesoSospechoso[]
  config: ConfigInsights
}
