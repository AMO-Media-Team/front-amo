/**
 * Plugins de Chart.js propios, sin estado global: se pasan por gráfico
 * (`plugins={[...]}`) y leen sus colores de `options.plugins.<id>`.
 */
import type { ChartType, Plugin } from "chart.js"

/** Opciones del texto de conversión entre etapas del embudo. */
export interface OpcionesConversiones {
  color?: string
  fuente?: string
  /** Un texto por etapa; el de la primera se ignora. */
  textos?: readonly string[]
}

/** Texto central de la dona cuando se dibuja en el lienzo (capturas). */
export interface OpcionesCentro {
  mostrar?: boolean
  etiqueta?: string
  valor?: string
  color?: string
  colorSecundario?: string
  fuente?: string
}

declare module "chart.js" {
  // La fusión de declaraciones exige el mismo parámetro de tipo que Chart.js.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface PluginOptionsByType<TType extends ChartType> {
    /** Línea vertical que sigue al puntero (líneas y columnas). */
    amoCruz?: { color?: string }
    amoConversiones?: OpcionesConversiones
    amoCentro?: OpcionesCentro
  }
}

/**
 * Cruz vertical: el lector apunta a una fecha, no a una línea de 2 px. Se
 * dibuja bajo las series, en el centro del elemento activo.
 */
export const pluginCruz: Plugin = {
  id: "amoCruz",
  beforeDatasetsDraw(grafico, _argumentos, opciones: { color?: string }) {
    const activo = grafico.getActiveElements()[0]
    if (!activo) return
    const { ctx, chartArea } = grafico
    const x = activo.element.x
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(x, chartArea.top)
    ctx.lineTo(x, chartArea.bottom)
    ctx.lineWidth = 1
    ctx.strokeStyle = opciones.color ?? "rgba(128, 128, 128, 0.4)"
    ctx.stroke()
    ctx.restore()
  },
}

/**
 * Total en el centro de la dona, pintado en el lienzo. En pantalla lo muestra
 * un HTML animado encima; en las capturas no hay HTML, así que se dibuja aquí.
 */
export const pluginCentro: Plugin = {
  id: "amoCentro",
  afterDraw(grafico, _argumentos, opciones: OpcionesCentro) {
    if (!opciones.mostrar || !opciones.valor) return
    const { ctx, chartArea } = grafico
    const x = (chartArea.left + chartArea.right) / 2
    const y = (chartArea.top + chartArea.bottom) / 2
    const lado = Math.min(chartArea.width, chartArea.height)
    const familia = opciones.fuente ?? "sans-serif"
    ctx.save()
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillStyle = opciones.colorSecundario ?? "#888"
    ctx.font = `500 ${Math.round(lado * 0.05)}px ${familia}`
    if (opciones.etiqueta) ctx.fillText(opciones.etiqueta, x, y - lado * 0.08)
    ctx.fillStyle = opciones.color ?? "#000"
    ctx.font = `600 ${Math.round(lado * 0.1)}px ${familia}`
    ctx.fillText(opciones.valor, x, y + lado * 0.03)
    ctx.restore()
  },
}
