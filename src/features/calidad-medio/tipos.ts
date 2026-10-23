/**
 * DTO de «Calidad de tus cuentas» (PRC-003, PRC-004): lo que el servidor lee
 * de `cuentas_sociales` (el medio ve sus propias cuentas por RLS) y los
 * parámetros del cálculo (`configuracion`, módulo `calidad`).
 */
import type { Corte, Plataforma } from "@/features/operacion/estados"

/** Cuenta verificada con lo que dejó el último recálculo semanal. */
export interface CuentaCalidad {
  id: string
  plataforma: Plataforma
  /** Sin arroba, como se guarda. */
  handle: string
  seguidores: number | null
  franja: { clave: string; nombre: string } | null
  /** Alcance mediano de las publicaciones que entraron al cálculo. */
  alcanceMediano: number | null
  /** Alcance mediano ÷ seguidores verificados (`indice_calidad`). */
  indice: number | null
  /** Mediana del índice en su franja y plataforma (`indice_franja`). */
  indiceFranja: number | null
  /** Multiplicador guardado (`multiplicador_calidad`). */
  multiplicador: number
  /** Cambio anunciado (`multiplicador_proximo`) y desde cuándo rige. */
  proximo: number | null
  proximoDesde: string | null
  /** Publicaciones verificadas que entraron al cálculo (≤ la ventana). */
  publicacionesVerificadas: number
  calculadoAt: string | null
}

/** Parámetros del multiplicador (`calidad.*`, docs/modelo-datos.md §7). */
export interface ParametrosCalidad {
  /** `calidad.minimo_publicaciones`: por debajo, el multiplicador es 1. */
  minimoPublicaciones: number
  /** `calidad.ventana_publicaciones`: últimas N para la mediana. */
  ventanaPublicaciones: number
  /** `calidad.multiplicador_piso` y `calidad.multiplicador_techo`. */
  piso: number
  techo: number
  /** `calidad.corte_referencia`: el corte de métricas que se compara. */
  corteReferencia: Corte
  /** `calidad.dias_aviso_cambio`: antelación con que se anuncia un cambio. */
  diasAvisoCambio: number
}
