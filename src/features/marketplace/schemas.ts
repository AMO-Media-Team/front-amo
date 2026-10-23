/**
 * Entradas de las acciones del marketplace (módulo puro): los MISMOS
 * esquemas en el cliente y en las Server Actions. La BD vuelve a validarlo
 * todo (elegibilidad, cupo, presupuesto, topes, clave de idempotencia).
 */
import { z } from "zod"

/** Tope del motivo de «No me interesa» (la BD admite 1.000). */
export const LONGITUD_MAXIMA_MOTIVO_RECHAZO = 500

const idOferta = z.uuid({ error: "La oferta no es válida." })

export const esquemaOfertaMedio = z.object({ ofertaId: idOferta })
export type EntradaOfertaMedio = z.input<typeof esquemaOfertaMedio>

export const esquemaAceptarOferta = z.object({
  ofertaId: idOferta,
  cuentaSocialId: z.uuid({ error: "Elige con qué cuenta vas a publicar." }),
  /** Una por intento: el reintento por red reusa la misma (MED-010). */
  claveIdempotencia: z.uuid({
    error: "No pudimos preparar la solicitud. Actualiza la página.",
  }),
})
export type EntradaAceptarOferta = z.input<typeof esquemaAceptarOferta>

/** «No me interesa»: el motivo es opcional; vacío se guarda como `null`. */
export const esquemaRechazarOferta = z.object({
  ofertaId: idOferta,
  motivo: z
    .string()
    .trim()
    .max(
      LONGITUD_MAXIMA_MOTIVO_RECHAZO,
      `Máximo ${LONGITUD_MAXIMA_MOTIVO_RECHAZO} caracteres.`
    )
    .optional()
    .transform((valor) => valor || null),
})
export type EntradaRechazarOferta = z.input<typeof esquemaRechazarOferta>
