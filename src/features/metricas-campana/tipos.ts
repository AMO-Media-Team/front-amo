/**
 * Datos de la pestaña «Métricas» de una campaña (ANU-012). Serializables: el
 * servidor los arma y viajan a la página y, en la exportación, de la Server
 * Action al navegador, que arma el Excel o el PDF.
 *
 * El consolidado es el oficial (`desempeno_anunciante` con la campaña): solo
 * las asignaciones VERIFICADAS (cumplidas), con el último corte aprobado de
 * cada publicación. Lo que aún no se verifica se informa aparte como
 * resultados parciales.
 */
import type { FilaDesempeno } from "@/features/dashboard/anunciante/datos"
import type { EstadoCampana } from "@/features/operacion/estados"

import type { Dimension } from "./dimensiones"

export type { Dimension, FilaDesempeno }

/** Lo que la pestaña y los documentos dicen de la campaña. */
export interface CampanaMetricas {
  id: string
  nombre: string
  marca: string
  estado: EstadoCampana
  /** 'YYYY-MM-DD'. */
  fechaInicio: string
  fechaFin: string
}

/** Rango de días (Bogotá) de las verificaciones de la campaña. */
export interface PeriodoVerificacion {
  /** 'YYYY-MM-DD'. */
  desde: string
  hasta: string
}

/**
 * Lo que todavía no entra al consolidado: asignaciones en pie que no se han
 * verificado. Sus cortes aprobados ya se ven uno a uno en «Seguimiento».
 */
export interface ResultadosParciales {
  /** Sin verificar, con al menos un corte aprobado. */
  conCortes: number
  /** Suma de su último corte aprobado por publicación. */
  alcance: number
  impresiones: number
  interacciones: number
  /** Siguen en ejecución sin cortes aprobados todavía. */
  enEjecucion: number
}

/** Totales del consolidado (cocientes de sumas, nunca promedio de razones). */
export interface TotalesCampana {
  /** Asignaciones verificadas: la muestra de las razones. */
  verificadas: number
  inversion: number
  alcance: number
  impresiones: number
  interacciones: number
  reproducciones: number
  clics: number
  cpm: number | null
  costoInteraccion: number | null
  engagement: number | null
  costoAlcance: number | null
}

export interface DatosMetricasCampana {
  campana: CampanaMetricas
  /** `null` sin asignaciones verificadas (no hay nada que consultar). */
  periodo: PeriodoVerificacion | null
  /** Filas de `desempeno_anunciante` por cada corte. */
  cortes: Readonly<Record<Dimension, FilaDesempeno[]>>
  totales: TotalesCampana
  parciales: ResultadosParciales
  /** `analitica.n_minimo_tasas`: con menos, la razón se informa con su n. */
  nMinimo: number
  /** Instante ISO de la consulta. */
  consultadoAt: string
}

/** Respuesta de la exportación: los datos, ya registrados en la bitácora. */
export interface ArchivoMetricas {
  datos: DatosMetricasCampana
  dimension: Dimension
  generadoPor: string
  /** Instante ISO del registro (sello del documento). */
  generadoAt: string
}
