/**
 * Entradas de las acciones del anunciante sobre su oferta (módulo puro): los
 * MISMOS esquemas en el cliente y en las Server Actions. El motivo sigue los
 * límites de `DialogoMotivo`; la BD exige motivo al cancelar una publicada y
 * vuelve a validarlo todo.
 */
import { z } from "zod"

import {
  LONGITUD_MAXIMA_MOTIVO,
  LONGITUD_MINIMA_MOTIVO,
} from "@/features/usuarios/schemas"

const id = z.uuid({ error: "Identificador inválido." })

export const esquemaOferta = z.object({ ofertaId: id })
export type EntradaOferta = z.input<typeof esquemaOferta>

/** Motivo opcional (cancelar un borrador no lo pide); si llega, con sentido. */
const motivoOpcional = z
  .string()
  .trim()
  .max(LONGITUD_MAXIMA_MOTIVO, `Máximo ${LONGITUD_MAXIMA_MOTIVO} caracteres.`)
  .refine(
    (valor) => valor.length === 0 || valor.length >= LONGITUD_MINIMA_MOTIVO,
    `Describe el motivo (al menos ${LONGITUD_MINIMA_MOTIVO} caracteres).`
  )
  .optional()
  .transform((valor) => valor || null)

export const esquemaCancelarOferta = z.object({
  ofertaId: id,
  motivo: motivoOpcional,
})
export type EntradaCancelarOferta = z.input<typeof esquemaCancelarOferta>
