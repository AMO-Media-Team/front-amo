/**
 * Gráficos de los reportes como datos (serializables): el servidor los arma
 * desde las filas de las RPC, la página los pinta con los componentes de
 * `@/components/charts` y la exportación los vuelve a dibujar para el PDF y
 * escribe sus datos en el Excel. Módulo puro.
 */
import type { SerieFormateada } from "@/components/charts/accesibilidad"
import type { CeldaActividad, ElementoValor } from "@/components/charts/datos"
import type { FormatoValor, Unidad } from "@/components/charts/formatos"
import type { Serie } from "@/components/charts/tipos"
import type { MetricaGeo } from "@/features/geo/metricas"
import { ZONA } from "@/lib/fechas"

interface BaseGrafico {
  id: string
  titulo: string
  descripcion?: string
  /** Nota al pie (definición, fuente, advertencias de muestra). */
  pie?: string
  /** Ocupa toda la fila o la mitad (en escritorio). */
  ancho: "completo" | "mitad"
  /** Sin datos: estado vacío en lugar del gráfico. */
  vacio: { titulo: string; descripcion?: string } | false
}

export type EspecGrafico = BaseGrafico &
  (
    | {
        tipo: "tendencia"
        etiquetas: string[]
        series: Serie[]
        anterior?: Omit<Serie, "id"> & { id?: string }
        formato: FormatoValor
      }
    | {
        tipo: "combo"
        etiquetas: string[]
        barras: SerieFormateada
        linea: SerieFormateada
      }
    | {
        tipo: "dona"
        segmentos: ElementoValor[]
        formato: FormatoValor
        etiquetaTotal?: string
        nombreCategoria?: string
      }
    | {
        tipo: "ranking"
        elementos: ElementoValor[]
        formato: FormatoValor
        nombreValor: string
        nombreCategoria?: string
        limite?: number
        agruparResto?: boolean
        destacado?: string
      }
    | {
        tipo: "apiladas"
        categorias: string[]
        series: Serie[]
        formato: FormatoValor
        orientacion?: "vertical" | "horizontal"
        nombreCategoria?: string
      }
    | {
        tipo: "calor"
        celdas: CeldaActividad[]
        unidad: Unidad
      }
    | {
        tipo: "mapa"
        /** Capas que la persona alterna (la primera es la inicial). */
        capas: CapaMapa[]
        /** Departamento resaltado (filtro del reporte). */
        destacado: string | null
      }
  )

export interface CapaMapa {
  metrica: MetricaGeo
  etiqueta: string
  /** Valor por código DANE de departamento; `null` = sin datos. */
  valores: Record<string, number | null>
}

/** Sin valores distintos de cero: el gráfico no dice nada. */
export function sinValores(valores: readonly (number | null)[]): boolean {
  return valores.every((valor) => valor === null || valor === 0)
}

// ── Series de tiempo ────────────────────────────────────────────────────────

export type Granularidad = "dia" | "semana" | "mes"

/** Un punto por día hasta un mes, por semana hasta ~4 meses y por mes después. */
export function granularidadPara(dias: number): Granularidad {
  if (dias <= 31) return "dia"
  if (dias <= 120) return "semana"
  return "mes"
}

const formatoDia = new Intl.DateTimeFormat("es-CO", {
  timeZone: ZONA,
  day: "numeric",
  month: "short",
})
const formatoMes = new Intl.DateTimeFormat("es-CO", {
  timeZone: ZONA,
  month: "short",
  year: "2-digit",
})

/**
 * Etiqueta del eje para un periodo 'YYYY-MM-DD' (inicio del día, de la
 * semana ISO o del mes): "12 sept", "Sem. 7 sept", "sept 26".
 */
export function etiquetaPeriodo(
  periodo: string,
  granularidad: Granularidad
): string {
  // Mediodía UTC: el día de calendario es el mismo en Bogotá.
  const fecha = new Date(`${periodo.slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(fecha.getTime())) return periodo
  switch (granularidad) {
    case "dia":
      return formatoDia.format(fecha)
    case "semana":
      return `Sem. ${formatoDia.format(fecha)}`
    case "mes":
      return formatoMes.format(fecha)
  }
}

/**
 * Alinea la serie del periodo anterior con la actual por posición (día 1 con
 * día 1): rellena con `null` lo que falte y descarta lo que sobre.
 */
export function alinearSerie(
  valores: readonly (number | null)[],
  largo: number
): (number | null)[] {
  return Array.from({ length: largo }, (_, i) => valores[i] ?? null)
}

/**
 * Ancho final de cada gráfico en la rejilla de dos columnas: un gráfico de
 * media fila que quedaría solo (entre dos de fila completa, o al final) pasa
 * a ocupar la fila entera para no dejar un hueco.
 */
export function distribuirAnchos(
  graficos: readonly Pick<EspecGrafico, "ancho">[]
): EspecGrafico["ancho"][] {
  const anchos = graficos.map((grafico) => grafico.ancho)
  let inicioTramo = 0
  for (let i = 0; i <= anchos.length; i++) {
    if (i < anchos.length && anchos[i] === "mitad") continue
    const largo = i - inicioTramo
    if (largo % 2 === 1) anchos[i - 1] = "completo"
    inicioTramo = i + 1
  }
  return anchos
}
