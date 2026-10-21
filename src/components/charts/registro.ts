"use client"

/**
 * Registro único y tree-shaken de Chart.js: solo los controladores, elementos,
 * escalas y plugins que usan los gráficos de AMO. Cada gráfico importa este
 * módulo; el registro corre una sola vez por pestaña.
 */
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js"
import { MatrixController, MatrixElement } from "chartjs-chart-matrix"

import { LOCALE } from "@/lib/format"

Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  MatrixController,
  MatrixElement,
  PointElement,
  // Sin `Legend`: las leyendas son HTML (interactivas y accesibles). El
  // tooltip nativo se desactiva: lo dibuja `TooltipVidrio` vía `external`.
  Tooltip
)

Chart.defaults.locale = LOCALE
Chart.defaults.responsive = true
Chart.defaults.maintainAspectRatio = false
Chart.defaults.plugins.tooltip.enabled = false

export { Chart }
