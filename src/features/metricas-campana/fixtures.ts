/**
 * Datos de prueba de las métricas de campaña (solo para las pruebas): filas
 * de `desempeno_anunciante` coherentes y un consolidado armado con ellas.
 */
import { totalesDesdeFilas } from "./calculos"
import type {
  DatosMetricasCampana,
  FilaDesempeno,
  ResultadosParciales,
} from "./tipos"

export const CAMPANA_METRICAS = "0199f3a0-0000-7000-8000-00000000ca02"

/** Una fila con sus razones calculadas como en la BD (cociente de sumas). */
export function filaDesempeno(
  clave: string,
  nombre: string,
  {
    asignaciones = 1,
    gmv = 1_000_000,
    alcance = 10_000,
    impresiones = 20_000,
    interacciones = 500,
    reproducciones = 0,
    clics = 0,
  }: Partial<
    Pick<
      FilaDesempeno,
      | "asignaciones"
      | "gmv"
      | "alcance"
      | "impresiones"
      | "interacciones"
      | "reproducciones"
      | "clics"
    >
  > = {}
): FilaDesempeno {
  return {
    clave,
    nombre,
    asignaciones,
    gmv,
    alcance,
    impresiones,
    interacciones,
    reproducciones,
    clics,
    cpm: impresiones > 0 ? (gmv / impresiones) * 1000 : null,
    costoInteraccion: interacciones > 0 ? gmv / interacciones : null,
    engagement: alcance > 0 ? interacciones / alcance : null,
    costoAlcance: alcance > 0 ? gmv / alcance : null,
    n: asignaciones,
  }
}

const SIN_PARCIALES: ResultadosParciales = {
  conCortes: 0,
  alcance: 0,
  impresiones: 0,
  interacciones: 0,
  enEjecucion: 0,
}

export function datosMetricas(
  cambios: Partial<DatosMetricasCampana> = {}
): DatosMetricasCampana {
  const plataforma = [
    filaDesempeno("INSTAGRAM", "Instagram", {
      asignaciones: 2,
      gmv: 3_000_000,
      alcance: 40_000,
      impresiones: 60_000,
      interacciones: 1_200,
    }),
    filaDesempeno("TIKTOK", "TikTok", {
      asignaciones: 1,
      gmv: 1_500_000,
      alcance: 100_000,
      impresiones: 140_000,
      interacciones: 7_700,
      reproducciones: 140_000,
    }),
  ]
  return {
    campana: {
      id: CAMPANA_METRICAS,
      nombre: "Temporada navideña",
      marca: "Café Sierra Alta",
      estado: "ACTIVA",
      fechaInicio: "2026-10-01",
      fechaFin: "2026-10-31",
    },
    periodo: { desde: "2026-10-18", hasta: "2026-10-21" },
    cortes: {
      plataforma,
      medio: [
        filaDesempeno("m1", "Arauca Noticias", {
          gmv: 1_500_000,
          alcance: 100_000,
          impresiones: 140_000,
          interacciones: 7_700,
        }),
        filaDesempeno("m2", "Chía Noticias", {
          asignaciones: 2,
          gmv: 3_000_000,
          alcance: 40_000,
          impresiones: 60_000,
          interacciones: 1_200,
        }),
      ],
      municipio: [
        filaDesempeno("11001", "Bogotá, D.C."),
        filaDesempeno("81001", "Arauca, Arauca"),
        filaDesempeno("25175", "Chía, Cundinamarca", { asignaciones: 1 }),
      ],
      fecha: [
        filaDesempeno("2026-10-21", "21/10/2026", { asignaciones: 2 }),
        filaDesempeno("2026-10-18", "18/10/2026"),
      ],
    },
    totales: totalesDesdeFilas(plataforma),
    parciales: SIN_PARCIALES,
    nMinimo: 20,
    consultadoAt: "2026-10-22T15:00:00.000Z",
    ...cambios,
  }
}
