/**
 * Un solo criterio de accesibilidad automática (axe-core) para todas las
 * specs: las normas WCAG 2.0, 2.1 y 2.2 de nivel A y AA (RNF-ACC-01) y lo que
 * no es de AMO y se deja fuera del análisis.
 *
 * - `infracciones(page)`: todas las infracciones, de cualquier impacto (las
 *   pantallas que ya están limpias no deben retroceder).
 * - `infraccionesGraves(page)`: solo las serias y críticas, el umbral que fija
 *   RNF-ACC-01 («axe-core sin violaciones serias o críticas»).
 *
 * Las dos aceptan una zona (`incluir`): un selector CSS o un `Locator`, para
 * auditar aparte un diálogo, una hoja, un menú o la tabla de un gráfico.
 *
 * Analiza con `reducedMotion: "reduce"` en el contexto: un texto a medio
 * aparecer (opacidad < 1) daría un contraste falso. Antes de auditar un
 * diálogo, espera a que su opacidad sea 1.
 */
import AxeBuilder from "@axe-core/playwright"

import type { Locator, Page } from "./prueba"

/** WCAG 2.2 AA incluye los criterios A y AA de las versiones anteriores. */
export const NORMAS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
] as const

/**
 * Fuera del análisis:
 * - el lienzo WebGL y los controles de Mapbox (atribución en inglés, de un
 *   tercero);
 * - los centinelas de foco de Base UI (`<span tabindex="0" aria-hidden>`
 *   alrededor de un popup abierto): son la trampa de foco de la propia
 *   librería y axe los marca como `aria-hidden-focus`.
 */
export const AJENOS = [
  ".mapboxgl-canvas-container",
  ".mapboxgl-control-container",
  "[data-base-ui-focus-guard]",
] as const

/** Impactos que RNF-ACC-01 no admite. */
export const IMPACTOS_GRAVES: readonly string[] = ["serious", "critical"]

/** Selector CSS o `Locator` de la parte de la página que se audita. */
export type ZonaAuditada = string | Locator

/** Marca temporal con la que axe recibe la zona de un `Locator`. */
const MARCA_ZONA = "data-auditoria-axe"

interface Infraccion {
  id: string
  impact?: string | null
  help: string
  nodes: { target: unknown[] }[]
}

/** «regla (impacto): ayuda → nodo | nodo», legible en el informe de la prueba. */
export function describirInfraccion({
  id,
  impact,
  help,
  nodes,
}: Infraccion): string {
  const nodos = nodes.map((nodo) => nodo.target.map(String).join(" "))
  return `${id} (${impact ?? "sin impacto"}): ${help} → ${nodos.join(" | ")}`
}

/**
 * Una llamada a `exclude` por selector: un arreglo en una sola llamada es,
 * para axe, la ruta de un elemento dentro de un iframe (`["iframe", "nodo"]`)
 * y no dejaría nada fuera.
 */
function nuevaAuditoria(page: Page): AxeBuilder {
  return AJENOS.reduce(
    (auditoria, selector) => auditoria.exclude(selector),
    new AxeBuilder({ page }).withTags([...NORMAS])
  )
}

async function analizar(
  page: Page,
  incluir: ZonaAuditada | undefined
): Promise<Infraccion[]> {
  let auditoria = nuevaAuditoria(page)
  if (typeof incluir === "string") {
    return (await auditoria.include(incluir).analyze()).violations
  }
  if (!incluir) return (await auditoria.analyze()).violations

  // axe recibe selectores CSS: el Locator se traduce en una marca temporal.
  const marcados = await incluir.evaluateAll((elementos, marca) => {
    for (const elemento of elementos) elemento.setAttribute(marca, "")
    return elementos.length
  }, MARCA_ZONA)
  if (marcados === 0) {
    throw new Error("La zona que se iba a auditar no está en la página.")
  }
  try {
    auditoria = auditoria.include(`[${MARCA_ZONA}]`)
    return (await auditoria.analyze()).violations
  } finally {
    await page
      .locator(`[${MARCA_ZONA}]`)
      .evaluateAll((elementos, marca) => {
        for (const elemento of elementos) elemento.removeAttribute(marca)
      }, MARCA_ZONA)
      .catch(() => {})
  }
}

/** Todas las infracciones de WCAG 2.2 AA (cualquier impacto). */
export async function infracciones(
  page: Page,
  incluir?: ZonaAuditada
): Promise<string[]> {
  return (await analizar(page, incluir)).map(describirInfraccion)
}

/** Solo las infracciones serias y críticas (umbral de RNF-ACC-01). */
export async function infraccionesGraves(
  page: Page,
  incluir?: ZonaAuditada
): Promise<string[]> {
  return (await analizar(page, incluir))
    .filter(({ impact }) => IMPACTOS_GRAVES.includes(impact ?? ""))
    .map(describirInfraccion)
}
