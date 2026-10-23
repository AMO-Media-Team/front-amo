/**
 * Logo de la empresa (bucket privado `avatares`, ruta
 * `anunciante/{id}/logo-{uuid}.{ext}` construida por el servidor; módulo
 * puro). Se reduce en el navegador a 512 px en WebP (el plan free no
 * transforma imágenes) y conserva la transparencia.
 */
import { BUCKETS } from "@/lib/archivos/buckets"
import type { OpcionesCompresion } from "@/lib/archivos/compresion"
import type { LimitesArchivo } from "@/lib/archivos/esquemas"
import { MIB } from "@/lib/archivos/formato"
import type { ReglasArchivo } from "@/lib/archivos/validar"

/** Lo que acepta el bucket: el archivo final (ya reducido) no pasa de 2 MB. */
export const REGLAS_LOGO: ReglasArchivo & LimitesArchivo = {
  mimes: BUCKETS.avatares.mimes,
  maxBytes: BUCKETS.avatares.maxBytes,
}

/** Al elegir: un logo exportado puede pesar más; se reduce antes de subir. */
export const REGLAS_SELECCION_LOGO: ReglasArchivo = {
  mimes: BUCKETS.avatares.mimes,
  maxBytes: 15 * MIB,
}

/** Lado mayor del logo final (se muestra a ≤ 96 px en pantallas 3x). */
export const COMPRESION_LOGO: OpcionesCompresion = {
  maxLado: 512,
  calidad: 0.9,
}

export const AYUDA_LOGO =
  "PNG, JPG o WebP. Lo ajustamos a 512 px al subirlo; si es PNG con fondo transparente, se conserva."

/**
 * Archivo que se sube: el reducido, salvo que el navegador no sepa codificar
 * WebP (Safari entrega JPEG) y el original sea un PNG que ya cabe en el
 * bucket: así no se pierde la transparencia del logo.
 */
export function elegirLogoFinal(original: File, reducido: File): File {
  const perderiaTransparencia =
    original.type === "image/png" && reducido.type === "image/jpeg"
  return perderiaTransparencia && original.size <= REGLAS_LOGO.maxBytes
    ? original
    : reducido
}
