/**
 * Piezas compartidas por las definiciones de los reportes: tabla exportable a
 * partir de las columnas, notas de definición comunes y nombres de
 * plataforma. Módulo puro.
 */
import type { DefinicionKpi } from "@/components/kpi/definiciones-kpi"
import type { SentidoKpi, UnidadKpi } from "@/components/kpi/tipos"
import type { Plataforma } from "@/features/dashboard/insights/tipos"
import { formatearNumero } from "@/lib/format"

import {
  type ColumnaReporte,
  columnasExcel,
  columnasPdf,
  filasExcel,
  filasPdf,
} from "../columnas"
import type { NotaDefinicion, TablaExportable } from "../tipos"

export const PLATAFORMAS: readonly Plataforma[] = [
  "FACEBOOK",
  "INSTAGRAM",
  "TIKTOK",
]

export const NOMBRE_PLATAFORMA: Readonly<Record<Plataforma, string>> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
}

export function nombrePlataforma(clave: string): string {
  return (PLATAFORMAS as readonly string[]).includes(clave)
    ? NOMBRE_PLATAFORMA[clave as Plataforma]
    : clave
}

export function tablaExportable<F>(
  titulo: string,
  columnas: readonly ColumnaReporte<F>[],
  filas: readonly F[],
  descripcion?: string
): TablaExportable {
  return {
    titulo,
    descripcion,
    columnas: columnasExcel(columnas),
    filas: filasExcel(columnas, filas),
    columnasPdf: columnasPdf(columnas),
    filasPdf: filasPdf(columnas, filas),
  }
}

/** Definición de un indicador propio del reporte (fuera del diccionario de KPI). */
export function definicionPropia(
  nombre: string,
  unidad: UnidadKpi,
  sentido: SentidoKpi,
  textos: { definicion: string; calculo: string; ancla: string; nota?: string },
  exigeMuestra = false
): DefinicionKpi {
  return { nombre, unidad, sentido, exigeMuestra, ...textos }
}

export function notaComparacion(): NotaDefinicion {
  return {
    termino: "Comparativo",
    explicacion:
      "Cada variación compara el periodo elegido con uno equivalente anterior: un mes con el mes anterior (a la misma altura si el mes está en curso), un trimestre con el anterior, el año con el mismo tramo del año pasado y los demás rangos con el mismo número de días inmediatamente antes. Las tasas se comparan en puntos porcentuales (pp).",
  }
}

export function notaMuestra(nMinimo: number): NotaDefinicion {
  return {
    termino: "Muestra insuficiente",
    explicacion: `Una tasa calculada sobre pocos casos engaña. Cuando un total agregado tiene menos de ${formatearNumero(nMinimo)} casos (n), el reporte no muestra la tasa ni la compara; en las filas de una sola campaña o un solo medio sí se muestra, con su n al lado.`,
  }
}

export const NOTA_ZONA_HORARIA: NotaDefinicion = {
  termino: "Fechas",
  explicacion:
    "Todas las fechas y horas están en hora de Colombia (Bogotá). Cada hecho cuenta en el periodo de su fecha ancla: aceptación, verificación, plazo de publicación o emisión, según el indicador.",
}

export const NOTA_ALCANCE: NotaDefinicion = {
  termino: "Alcance acumulado",
  explicacion:
    "Suma de las personas alcanzadas por cada publicación según su último corte de métricas validado (7 días, 72 horas o 24 horas). Una persona que vio dos publicaciones cuenta dos veces: no es audiencia única.",
}

export const NOTA_GMV: NotaDefinicion = {
  termino: "GMV comprometido y verificado",
  explicacion:
    "El GMV es el valor bruto que paga el anunciante. «Comprometido» cuenta los negocios aceptados por los medios en el periodo que siguen en pie; «verificado» cuenta los negocios cumplidos, cuyas métricas se validaron en el periodo, y es el GMV oficial para comisión, liquidación y facturación.",
}
