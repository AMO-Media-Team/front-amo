/**
 * Gestos y comprobaciones de interfaz que comparten los specs: periodo,
 * estado en la URL, gráficos, tema y ancho de la página.
 */
import { expect, type Locator, type Page } from "@playwright/test"

/** Valor actual de un parámetro de la URL (`null` si no está). */
export function parametro(page: Page, clave: string): string | null {
  return new URL(page.url()).searchParams.get(clave)
}

/**
 * Elige un periodo rápido («Este año») en el selector de periodo. Los rápidos
 * se aplican al instante; «Aplicar» solo confirma un rango del calendario.
 */
export async function elegirPeriodoRapido(
  page: Page,
  etiqueta: string
): Promise<void> {
  await page.getByRole("button", { name: /^(Periodo|Creadas en): / }).click()
  const dialogo = page.getByRole("dialog", { name: "Elegir el periodo" })
  await dialogo
    .getByRole("group", { name: "Periodos rápidos" })
    .getByRole("button", { name: etiqueta, exact: true })
    .click()
  await expect(dialogo).toBeHidden()
}

/**
 * El primer lienzo de la zona tiene algo pintado: un gráfico de Chart.js que
 * no llegó a dibujarse deja el `<canvas>` presente pero transparente.
 */
export async function esperarGraficoDibujado(zona: Locator): Promise<void> {
  const lienzo = zona.locator("canvas").first()
  await lienzo.scrollIntoViewIfNeeded()
  await expect(lienzo).toBeVisible()
  await expect
    .poll(() =>
      lienzo.evaluate((elemento: HTMLCanvasElement) => {
        const contexto = elemento.getContext("2d")
        if (!contexto || elemento.width === 0 || elemento.height === 0) {
          return false
        }
        const { data } = contexto.getImageData(
          0,
          0,
          elemento.width,
          elemento.height
        )
        for (let alfa = 3; alfa < data.length; alfa += 4) {
          if (data[alfa] !== 0) return true
        }
        return false
      })
    )
    .toBe(true)
}

export type Tema = "dark" | "light"

/**
 * Fija el tema de este navegador como lo recuerda next-themes y recarga la
 * página. No toca las preferencias de la cuenta (las sesiones se comparten).
 */
export async function fijarTema(page: Page, tema: Tema): Promise<void> {
  await page.evaluate(
    (valor) => window.localStorage.setItem("theme", valor),
    tema
  )
  await page.reload()
  await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${tema}\\b`))
}

/** La página no se desborda a lo ancho (sin barra de desplazamiento horizontal). */
export async function esperarSinDesbordeHorizontal(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth
      )
    )
    .toBeLessThanOrEqual(0)
}
