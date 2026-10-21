/**
 * Contrato de la exportación de un reporte (cliente ↔ Server Action): el
 * reporte, el formato y los filtros tal como están en la URL.
 */
import { z } from "zod"

import { SLUGS_REPORTE } from "./catalogo"
import { esquemaValoresFiltros } from "./filtros"

export const FORMATOS_REPORTE = ["xlsx", "pdf"] as const
export type FormatoReporte = (typeof FORMATOS_REPORTE)[number]

export const esquemaExportacionReporte = z.object({
  reporte: z.enum(SLUGS_REPORTE),
  formato: z.enum(FORMATOS_REPORTE),
  filtros: esquemaValoresFiltros,
})

export type EntradaExportacionReporte = z.input<
  typeof esquemaExportacionReporte
>
