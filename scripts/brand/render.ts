/** Rasterizado de SVG/HTML a PNG con Chromium (Playwright). */
import { chromium, type Browser } from "@playwright/test"

export interface Rasterizador {
  svgAPng(svg: string, ancho: number, alto: number): Promise<Buffer>
  htmlAPng(html: string, ancho: number): Promise<Buffer>
  cerrar(): Promise<void>
}

export async function crearRasterizador(): Promise<Rasterizador> {
  const navegador: Browser = await chromium.launch()

  async function svgAPng(
    svg: string,
    ancho: number,
    alto: number
  ): Promise<Buffer> {
    const pagina = await navegador.newPage({
      viewport: { width: ancho, height: alto },
      deviceScaleFactor: 1,
    })
    const fuente = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
    await pagina.setContent(
      `<html><body style="margin:0;background:transparent"><img src="${fuente}" width="${ancho}" height="${alto}" style="display:block"></body></html>`
    )
    await pagina.waitForFunction(() => document.images[0]?.complete)
    const png = await pagina.screenshot({
      omitBackground: true,
      clip: { x: 0, y: 0, width: ancho, height: alto },
    })
    await pagina.close()
    return png
  }

  async function htmlAPng(html: string, ancho: number): Promise<Buffer> {
    const pagina = await navegador.newPage({
      viewport: { width: ancho, height: 800 },
      deviceScaleFactor: 1,
    })
    await pagina.setContent(html, { waitUntil: "load" })
    const png = await pagina.screenshot({ fullPage: true })
    await pagina.close()
    return png
  }

  return { svgAPng, htmlAPng, cerrar: () => navegador.close() }
}
