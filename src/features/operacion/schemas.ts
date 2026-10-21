/**
 * Entradas de las Server Actions de operación (mismo esquema en cliente y
 * servidor). Nunca aceptan rutas de archivos ni nombres de columnas: el
 * servidor las deriva de ids ya validados.
 */
import { z } from "zod"

export const ENTIDADES_PRIVADAS = ["medio", "anunciante"] as const
export const GRUPOS_PRIVADOS = ["contacto", "pago"] as const

export const esquemaRevelar = z
  .object({
    entidad: z.enum(ENTIDADES_PRIVADAS),
    id: z.uuid(),
    grupo: z.enum(GRUPOS_PRIVADOS),
  })
  .refine(
    (entrada) => entrada.entidad === "medio" || entrada.grupo === "contacto",
    {
      message: "Ese grupo de datos no existe para un anunciante.",
    }
  )

export type EntradaRevelar = z.input<typeof esquemaRevelar>

export const esquemaEvidencias = z.object({ asignacionId: z.uuid() })

export type EntradaEvidencias = z.input<typeof esquemaEvidencias>

export const ENTIDADES_EXPORTABLES = [
  "medios",
  "anunciantes",
  "campanas",
  "asignaciones",
] as const

export type EntidadExportable = (typeof ENTIDADES_EXPORTABLES)[number]

export const esquemaExportacion = z.object({
  entidad: z.enum(ENTIDADES_EXPORTABLES),
  formato: z.enum(["csv", "xlsx"]),
  filas: z.number().int().min(0).max(10_000),
})

export type EntradaExportacion = z.input<typeof esquemaExportacion>
