/**
 * Entradas de las acciones del medio sobre sus asignaciones (módulo puro):
 * los MISMOS esquemas en el cliente y en las Server Actions. El motivo de
 * desistir sigue los límites de `DialogoMotivo`; la BD lo vuelve a exigir.
 */
import { z } from "zod"

import {
  LONGITUD_MAXIMA_MOTIVO,
  LONGITUD_MINIMA_MOTIVO,
} from "@/features/usuarios/schemas"

const id = z.uuid({ error: "Identificador inválido." })

export const esquemaAsignacion = z.object({ asignacionId: id })
export type EntradaAsignacion = z.input<typeof esquemaAsignacion>

export const esquemaDesistir = z.object({
  asignacionId: id,
  motivo: z
    .string({ error: "Cuéntanos por qué desistes." })
    .trim()
    .min(
      LONGITUD_MINIMA_MOTIVO,
      `Cuéntanos por qué desistes (al menos ${LONGITUD_MINIMA_MOTIVO} caracteres).`
    )
    .max(
      LONGITUD_MAXIMA_MOTIVO,
      `Máximo ${LONGITUD_MAXIMA_MOTIVO} caracteres.`
    ),
})
export type EntradaDesistir = z.input<typeof esquemaDesistir>

export const esquemaFirmarArchivo = z.object({
  asignacionId: id,
  archivoId: id,
  /** `true`: como adjunto (botón «Descargar»); si no, para verlo en línea. */
  descargar: z.boolean().optional(),
})
export type EntradaFirmarArchivo = z.input<typeof esquemaFirmarArchivo>
