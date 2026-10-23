import "server-only"

import {
  etiquetaMunicipio,
  type FilaDesempeno,
} from "@/features/dashboard/anunciante/datos"
import { numero } from "@/features/dashboard/insights/adaptadores"
import { configAnalitica } from "@/features/dashboard/servidor"
import { clienteSolicitud, fallar } from "@/features/operacion/queries/comun"
import { nombrePlataforma } from "@/features/reportes/definiciones/comun"
import { seguimientoDeCampana } from "@/features/seguimiento/queries"

import {
  periodoVerificacion,
  resultadosParciales,
  totalesDesdeFilas,
} from "./calculos"
import { DIMENSIONES, type Dimension } from "./dimensiones"
import type {
  CampanaMetricas,
  DatosMetricasCampana,
  PeriodoVerificacion,
} from "./tipos"

/**
 * Consultas de la pestaña «Métricas» con el cliente de la SESIÓN.
 * `desempeno_anunciante` es invoker, exige `reportes.ver` (o el inicio del
 * anunciante) y filtra a su organización; con `p_campana_id` queda en la
 * campaña. Un error se lanza y lo recoge el límite de la pestaña.
 */

const n = (valor: number | string | null | undefined) => numero(valor) ?? 0

async function corte(
  campanaId: string,
  periodo: PeriodoVerificacion,
  dimension: Dimension
): Promise<FilaDesempeno[]> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase.rpc("desempeno_anunciante", {
    p_desde: periodo.desde,
    p_hasta: periodo.hasta,
    p_dimension: dimension,
    p_campana_id: campanaId,
  })
  if (error) fallar("leer las métricas de la campaña", error)
  return data.map((fila) => ({
    clave: fila.clave,
    nombre:
      dimension === "plataforma"
        ? nombrePlataforma(fila.clave)
        : dimension === "municipio" && fila.nombre
          ? etiquetaMunicipio(fila.nombre)
          : (fila.nombre ?? fila.clave),
    asignaciones: n(fila.asignaciones),
    gmv: n(fila.gmv),
    alcance: n(fila.alcance),
    impresiones: n(fila.impresiones),
    interacciones: n(fila.interacciones),
    reproducciones: n(fila.reproducciones),
    clics: n(fila.clics),
    cpm: numero(fila.cpm_efectivo),
    costoInteraccion: numero(fila.costo_por_interaccion),
    engagement: numero(fila.engagement),
    costoAlcance: numero(fila.costo_por_alcance),
    n: n(fila.n),
  }))
}

const SIN_FILAS: Readonly<Record<Dimension, FilaDesempeno[]>> = {
  plataforma: [],
  medio: [],
  municipio: [],
  fecha: [],
}

/**
 * Consolidado de la campaña: las asignaciones verificadas (el periodo exacto
 * de sus verificaciones, para que el corte por fecha no se llene de días
 * vacíos) en sus cuatro cortes, y lo que aún falta por verificar. El
 * seguimiento se lee una vez por solicitud y lo comparte con su pestaña.
 */
export async function metricasDeCampana(
  campana: CampanaMetricas
): Promise<DatosMetricasCampana> {
  const [seguimiento, config] = await Promise.all([
    seguimientoDeCampana(campana.id),
    configAnalitica(),
  ])
  const periodo = periodoVerificacion(seguimiento.asignaciones)
  const cortes = periodo
    ? (Object.fromEntries(
        await Promise.all(
          DIMENSIONES.map(
            async (dimension) =>
              [dimension, await corte(campana.id, periodo, dimension)] as const
          )
        )
      ) as Record<Dimension, FilaDesempeno[]>)
    : SIN_FILAS
  return {
    campana,
    periodo,
    cortes,
    totales: totalesDesdeFilas(cortes.plataforma),
    parciales: resultadosParciales(seguimiento.asignaciones),
    nMinimo: config.nMinimo,
    consultadoAt: new Date().toISOString(),
  }
}
