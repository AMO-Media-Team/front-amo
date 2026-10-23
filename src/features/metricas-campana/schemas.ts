/**
 * Entrada de la exportación de métricas de una campaña (mismo esquema en el
 * cliente y en el servidor).
 */
import { z } from "zod"

import { DIMENSIONES } from "./dimensiones"

export const FORMATOS_METRICAS = ["xlsx", "pdf"] as const

export type FormatoMetricas = (typeof FORMATOS_METRICAS)[number]

export const esquemaExportacionMetricas = z.object({
  campanaId: z.uuid({ message: "La campaña no es válida." }),
  formato: z.enum(FORMATOS_METRICAS, { message: "Elige Excel o PDF." }),
  dimension: z.enum(DIMENSIONES, { message: "Elige un corte válido." }),
})

export type EntradaExportacionMetricas = z.input<
  typeof esquemaExportacionMetricas
>
