/**
 * Entradas de las decisiones de moderación (módulo puro): los MISMOS
 * esquemas en el cliente y en las Server Actions. El comentario de una
 * devolución y el motivo de un rechazo o una cancelación siguen los límites
 * de `DialogoMotivo` (la BD admite hasta 2.000 y lo vuelve a validar).
 */
import { z } from "zod"

import {
  LONGITUD_MAXIMA_MOTIVO,
  LONGITUD_MINIMA_MOTIVO,
} from "@/features/usuarios/schemas"

const id = z.uuid({ error: "Identificador inválido." })

/**
 * Envío a revisión que mostraba la ficha (`ofertas.enviada_at` tal cual lo
 * entrega la BD, con sus microsegundos: no se convierte a `Date`). Publicar,
 * devolver y rechazar deciden sobre ese envío: si el anunciante retiró y
 * reenvió la oferta mientras tanto, la BD lo rechaza (hint
 * `oferta_reenviada`). `null` solo en ofertas cargadas sin esa fecha.
 */
const enviadaAt = z.iso
  .datetime({ offset: true, error: "Fecha de envío inválida." })
  .nullable()

const motivo = z
  .string({ error: "Escribe el motivo." })
  .trim()
  .min(
    LONGITUD_MINIMA_MOTIVO,
    `Describe el motivo (al menos ${LONGITUD_MINIMA_MOTIVO} caracteres).`
  )
  .max(LONGITUD_MAXIMA_MOTIVO, `Máximo ${LONGITUD_MAXIMA_MOTIVO} caracteres.`)

/** Publicar la oferta en revisión. */
export const esquemaDecision = z.object({ ofertaId: id, enviadaAt })
export type EntradaDecision = z.input<typeof esquemaDecision>

/** Devolverla con comentario o rechazarla con motivo (también en revisión). */
export const esquemaDecisionConMotivo = z.object({
  ofertaId: id,
  enviadaAt,
  motivo,
})
export type EntradaDecisionConMotivo = z.input<typeof esquemaDecisionConMotivo>

/** Cancelar una oferta ya publicada (no parte de un envío en revisión). */
export const esquemaCancelacion = z.object({ ofertaId: id, motivo })
export type EntradaCancelacion = z.input<typeof esquemaCancelacion>
