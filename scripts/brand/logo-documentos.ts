/**
 * Logo de los documentos que se generan en el servidor (documento soporte en PDF): rasteriza el logotipo
 * horizontal para fondo claro de `public/brand` y lo deja como módulo TypeScript en base64
 * (`src/lib/export/logo-documentos.generated.ts`), porque jsPDF no admite SVG y el servidor no puede leer
 * `public/` con garantías en Vercel. Lo llama `pnpm brand:build`; también corre solo:
 *
 *   pnpm exec tsx scripts/brand/logo-documentos.ts
 */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { format, resolveConfig } from "prettier"

import { crearRasterizador, type Rasterizador } from "./render"

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..")
const ORIGEN = join(
  RAIZ,
  "public/brand/amo-logo-horizontal-descriptor-claro.svg"
)
const DESTINO = join(RAIZ, "src/lib/export/logo-documentos.generated.ts")
const ANCHO = 900

function proporcion(svg: string): number {
  const [, , ancho, alto] =
    /viewBox="([^"]+)"/
      .exec(svg)?.[1]
      ?.trim()
      .split(/[\s,]+/)
      .map(Number) ?? []
  if (!(ancho > 0 && alto > 0)) throw new Error("El logotipo no tiene viewBox")
  return ancho / alto
}

export async function generarLogoDocumentos(
  raster: Rasterizador
): Promise<void> {
  const svg = readFileSync(ORIGEN, "utf8")
  const alto = Math.round(ANCHO / proporcion(svg))
  const dimensionado = svg.replace(
    "<svg ",
    `<svg width="${ANCHO}" height="${alto}" `
  )
  const png = await raster.svgAPng(dimensionado, ANCHO, alto)
  const modulo = `/**
 * Generado por scripts/brand/logo-documentos.ts (pnpm brand:build): no lo edites a mano.
 * Logotipo horizontal de AMO para fondo claro, en PNG, para los PDF que se generan en el servidor.
 */
import type { ImagenPng } from "./logo"

export const LOGO_DOCUMENTOS: ImagenPng = {
  dataUrl: "data:image/png;base64,${png.toString("base64")}",
  ancho: ${ANCHO},
  alto: ${alto},
}
`
  const opciones = (await resolveConfig(DESTINO)) ?? {}
  writeFileSync(
    DESTINO,
    await format(modulo, { ...opciones, filepath: DESTINO })
  )
  console.log(
    `  ${DESTINO.replace(`${RAIZ}/`, "")} (${ANCHO}×${alto}, ${Math.round(png.length / 1024)} KB)`
  )
}

async function main(): Promise<void> {
  const raster = await crearRasterizador()
  try {
    await generarLogoDocumentos(raster)
  } finally {
    await raster.cerrar()
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
