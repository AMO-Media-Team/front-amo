/**
 * Regla 4 — Plataforma/formato con mejor CPM. Compara dentro de cada familia
 * de impresiones (Facebook e Instagram cuentan impresiones; TikTok,
 * reproducciones): con al menos dos combinaciones con muestra suficiente, la
 * de menor CPM se destaca si está ≥ 20 % por debajo del CPM de su familia.
 */
import { formatearCOP, formatearPorcentaje } from "@/lib/format"

import { construirHref, RUTAS_INSIGHTS } from "../rutas"
import { NOMBRES_PLATAFORMA } from "../textos"
import type { EntradaInsights, FilaMezcla, Insight, Plataforma } from "../tipos"

export const MEJORA_MINIMA = 0.2

type Familia = "impresiones" | "reproducciones"

const comparador = new Intl.Collator("es", { sensitivity: "base" })

function familiaDe(plataforma: Plataforma): Familia {
  return plataforma === "TIKTOK" ? "reproducciones" : "impresiones"
}

const DESCRIPCION_FAMILIA: Readonly<Record<Familia, string>> = {
  impresiones: "Facebook e Instagram",
  reproducciones: "TikTok",
}

function conCpm(
  fila: FilaMezcla
): fila is FilaMezcla & { cpmEfectivo: number } {
  return fila.cpmEfectivo !== null && fila.cpmEfectivo > 0 && fila.gmv > 0
}

/**
 * CPM de la familia como cociente de sumas (nunca promedio de CPM): las
 * impresiones de cada fila se recuperan como GMV / CPM × 1.000.
 */
export function cpmGlobal(filas: readonly FilaMezcla[]): number | null {
  const validas = filas.filter(conCpm)
  const gmv = validas.reduce((suma, f) => suma + f.gmv, 0)
  const impresiones = validas.reduce(
    (suma, f) => suma + (f.gmv / f.cpmEfectivo) * 1000,
    0
  )
  return impresiones > 0 ? (gmv / impresiones) * 1000 : null
}

function etiqueta(fila: FilaMezcla): string {
  return `${fila.formatoNombre} en ${NOMBRES_PLATAFORMA[fila.plataforma]}`
}

interface Candidato {
  fila: FilaMezcla & { cpmEfectivo: number }
  familia: Familia
  global: number
  mejora: number
}

function mejorDeFamilia(
  filas: readonly FilaMezcla[],
  familia: Familia,
  nMinimo: number
): Candidato | null {
  const deFamilia = filas.filter((f) => familiaDe(f.plataforma) === familia)
  const elegibles = deFamilia
    .filter(conCpm)
    .filter((f) => f.asignaciones >= nMinimo)
  const global = cpmGlobal(deFamilia)
  if (elegibles.length < 2 || global === null) return null
  const [mejor] = [...elegibles].sort(
    (a, b) =>
      a.cpmEfectivo - b.cpmEfectivo ||
      b.asignaciones - a.asignaciones ||
      comparador.compare(etiqueta(a), etiqueta(b))
  )
  const mejora = 1 - mejor.cpmEfectivo / global
  return mejora >= MEJORA_MINIMA
    ? { fila: mejor, familia, global, mejora }
    : null
}

export function reglaMejorCpm(entrada: EntradaInsights): Insight | null {
  const filas = entrada.mezclaPlataformas ?? []
  const candidatos = (["impresiones", "reproducciones"] as const)
    .map((familia) => mejorDeFamilia(filas, familia, entrada.config.nMinimo))
    .filter((c): c is Candidato => c !== null)
    .sort((a, b) => b.mejora - a.mejora)
  const mejor = candidatos[0]
  if (!mejor) return null

  const nombre = etiqueta(mejor.fila)
  return {
    id: `cpm-${mejor.fila.plataforma.toLowerCase()}-${mejor.fila.formatoClave}`,
    regla: 4,
    severidad: "positivo",
    titulo: `${nombre}: el CPM más eficiente`,
    detalle: `${nombre} entrega mil ${mejor.familia} por ${formatearCOP(mejor.fila.cpmEfectivo)}, ${formatearPorcentaje(mejor.mejora, 0)} por debajo del promedio de ${DESCRIPCION_FAMILIA[mejor.familia]} (${formatearCOP(mejor.global)}).`,
    metrica: "cpm_efectivo",
    valor: mejor.fila.cpmEfectivo,
    magnitud: mejor.mejora,
    accion: {
      etiqueta: "Ver desempeño por plataforma",
      href: construirHref(
        RUTAS_INSIGHTS.reporteDesempeno,
        { plataforma: mejor.fila.plataforma },
        entrada.periodo
      ),
    },
  }
}
