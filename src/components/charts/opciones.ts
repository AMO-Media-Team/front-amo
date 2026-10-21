/**
 * Piezas de configuración de Chart.js compartidas: tipografía, ejes
 * recesivos, animación de entrada (apagada con movimiento reducido) y
 * tooltip externo. Funciones puras sobre el `TemaGraficos`.
 */
import type { AnimationSpec, Chart, ChartType, TooltipModel } from "chart.js"

import { formatearEje, type FormatoValor } from "./formatos"
import type { TemaGraficos } from "./tema"

export type TooltipExterno<TTipo extends ChartType> = (contexto: {
  chart: Chart<TTipo>
  tooltip: TooltipModel<TTipo>
}) => void

/** Tipografía de ejes y etiquetas (compatible con Chart.js y datalabels). */
export interface FuenteGrafico {
  family: string
  size: number
  weight: number
  lineHeight: number
}

export function fuente(
  tema: TemaGraficos,
  tamano = 11,
  peso = 400
): FuenteGrafico {
  return { family: tema.fuente, size: tamano, weight: peso, lineHeight: 1.2 }
}

/** Duración de la entrada; con movimiento reducido no hay animación. */
export function animacion<TTipo extends ChartType>(
  tema: TemaGraficos,
  duracion = 700
): false | AnimationSpec<TTipo> {
  return tema.reducirMovimiento
    ? false
    : { duration: duracion, easing: "easeOutQuart" }
}

/** Densidad del lienzo (solo si el tema la fija, p. ej. en capturas). */
export function densidad(tema: TemaGraficos): { devicePixelRatio?: number } {
  return tema.densidad ? { devicePixelRatio: tema.densidad } : {}
}

/**
 * Retardo escalonado por posición en la primera animación (efecto "ola" sutil
 * en barras); en actualizaciones posteriores no se aplica.
 */
export function retardoEscalonado(pasoMs = 22) {
  return (contexto: { type: string; mode?: string; dataIndex: number }) =>
    contexto.type === "data" && contexto.mode === "default"
      ? contexto.dataIndex * pasoMs
      : 0
}

export function opcionesTooltip<TTipo extends ChartType>(
  externo: TooltipExterno<TTipo>
) {
  return { enabled: false, external: externo } as const
}

/** Eje de categorías (tiempo, nombres): sin rejilla, línea base fina. */
export function ejeCategorias(tema: TemaGraficos) {
  return {
    grid: { display: false },
    border: { color: tema.eje, width: 1 },
    ticks: {
      color: tema.textoSecundario,
      font: fuente(tema),
      maxRotation: 0,
      autoSkip: true,
      autoSkipPadding: 16,
      padding: 6,
    },
  }
}

/**
 * Eje de valores: rejilla de líneas finas y sólidas (nunca punteadas),
 * marcas compactas y pocas (≤ 5) para que el dato mande.
 */
export function ejeValores(
  tema: TemaGraficos,
  formato: FormatoValor,
  { maximoMarcas = 5 }: { maximoMarcas?: number } = {}
) {
  return {
    beginAtZero: true,
    grid: { color: tema.rejilla, lineWidth: 1, drawTicks: false },
    border: { display: false },
    ticks: {
      color: tema.textoSecundario,
      font: fuente(tema),
      padding: 8,
      maxTicksLimit: maximoMarcas,
      callback: (valor: number | string) =>
        formatearEje(Number(valor), formato),
    },
  }
}

/**
 * Rango sugerido de una escala que no parte de cero: abarca al menos ±`fraccion`
 * del valor medio, para que variaciones mínimas (19,6 % → 20,1 %) no se vean
 * como saltos. Nunca baja de cero si todos los valores son positivos.
 */
export function rangoConHolgura(
  valores: readonly (number | null)[],
  fraccion = 0.1
): { suggestedMin?: number; suggestedMax?: number } {
  const finitos = valores.filter(
    (valor): valor is number => valor !== null && Number.isFinite(valor)
  )
  if (finitos.length === 0) return {}
  const minimo = Math.min(...finitos)
  const maximo = Math.max(...finitos)
  const medio = (minimo + maximo) / 2
  const semi = Math.max((maximo - minimo) / 2, Math.abs(medio) * fraccion)
  const inferior = medio - semi
  return {
    suggestedMin: minimo >= 0 ? Math.max(0, inferior) : inferior,
    suggestedMax: medio + semi,
  }
}

/**
 * Tope de una escala que parte de cero con aire sobre el valor más alto
 * (`fraccion` del máximo). `undefined` si no hay valores positivos: Chart.js
 * calcula entonces su propio rango.
 */
export function maximoConMargen(
  valores: readonly (number | null)[],
  fraccion = 0.12
): number | undefined {
  const maximo = Math.max(
    0,
    ...valores.filter(
      (valor): valor is number => valor !== null && Number.isFinite(valor)
    )
  )
  return maximo > 0 ? maximo * (1 + fraccion) : undefined
}
