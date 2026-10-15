/**
 * Regla 2 — Caída de cumplimiento con vencidas. Dispara si la tasa baja 5 pp o
 * más frente al periodo anterior, o queda bajo 85 %, con muestra suficiente y
 * al menos 3 asignaciones vencidas sin publicar. Señala dónde se concentran.
 */
import { formatearPorcentaje } from "@/lib/format"

import { construirHref, RUTAS_INSIGHTS } from "../rutas"
import { enumerar, plural, porCantidadDesc } from "../textos"
import type { ConteoPorGrupo, EntradaInsights, Insight } from "../tipos"

export const CAIDA_MINIMA_PP = 0.05
export const PISO_CUMPLIMIENTO = 0.85
export const PISO_CRITICO = 0.75
export const META_CUMPLIMIENTO = 0.9
export const MINIMO_VENCIDAS = 3

const formatoPuntos = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/** Redondeo a décimas de punto: evita que 0,82 − 0,87 = −0,0500000001 falle. */
function enPuntos(fraccion: number): number {
  return Math.round(fraccion * 1000) / 10
}

function ordenar(grupos: readonly ConteoPorGrupo[]): ConteoPorGrupo[] {
  return grupos
    .filter((g) => g.cantidad > 0)
    .sort(porCantidadDesc((g) => g.cantidad))
}

export function reglaCumplimiento(entrada: EntradaInsights): Insight | null {
  const fila = entrada.kpis.find((k) => k.kpi === "tasa_cumplimiento")
  const vencidas = entrada.vencidas
  if (!fila || fila.valor === null || !vencidas) return null
  if ((fila.n ?? 0) < entrada.config.nMinimo) return null
  if (vencidas.total < MINIMO_VENCIDAS) return null

  const caidaPp =
    fila.valor_anterior === null
      ? null
      : enPuntos(fila.valor - fila.valor_anterior)
  const cayo = caidaPp !== null && caidaPp <= -enPuntos(CAIDA_MINIMA_PP)
  const bajoPiso = fila.valor < PISO_CUMPLIMIENTO
  if (!cayo && !bajoPiso) return null

  const tasa = formatearPorcentaje(fila.valor, 1)
  const titulo = cayo
    ? `El cumplimiento cayó a ${tasa}`
    : `El cumplimiento está en ${tasa}`
  const contexto = cayo
    ? `Bajó ${formatoPuntos.format(Math.abs(caidaPp ?? 0))} pp frente al periodo anterior.`
    : `Está por debajo del ${formatearPorcentaje(PISO_CUMPLIMIENTO, 0)} (meta: ${formatearPorcentaje(META_CUMPLIMIENTO, 0)}).`

  const [zona] = ordenar(vencidas.porDepartamento)
  const medios = ordenar(vencidas.porMedio).slice(0, 3)
  const partes = [
    contexto,
    `${plural(vencidas.total, "asignación venció", "asignaciones vencieron")} sin publicar${
      zona ? `; ${zona.nombre} concentra ${zona.cantidad}` : ""
    }.`,
    medios.length
      ? `Medios con más vencidas: ${enumerar(medios.map((m) => `${m.nombre} (${m.cantidad})`))}.`
      : "",
  ]

  return {
    id: "cumplimiento",
    regla: 2,
    severidad: fila.valor < PISO_CRITICO ? "critico" : "atencion",
    titulo,
    detalle: partes.filter(Boolean).join(" "),
    metrica: "tasa_cumplimiento",
    valor: fila.valor,
    magnitud: Math.max(
      caidaPp === null ? 0 : -caidaPp / 100,
      META_CUMPLIMIENTO - fila.valor
    ),
    accion: {
      etiqueta: "Ver cumplimiento de medios",
      href: construirHref(
        RUTAS_INSIGHTS.reporteCumplimiento,
        { departamento: zona?.clave },
        entrada.periodo
      ),
    },
  }
}
