/**
 * Entradas de las acciones de suspensión de medios (módulo puro): los MISMOS
 * esquemas en el diálogo y en las Server Actions. El motivo refleja el CHECK
 * de la BD (`medios.motivo_estado` ≤ 500) y el mínimo de los demás motivos de
 * la plataforma; la BD vuelve a exigirlo en `transicionar_srv`.
 */
import { z } from "zod"

import {
  LONGITUD_MAXIMA_MOTIVO,
  LONGITUD_MINIMA_MOTIVO,
} from "@/features/usuarios/schemas"

const id = z.uuid({ error: "Identificador inválido." })

const motivo = z
  .string({ error: "Escribe el motivo." })
  .trim()
  .min(
    LONGITUD_MINIMA_MOTIVO,
    `Describe el motivo (al menos ${LONGITUD_MINIMA_MOTIVO} caracteres).`
  )
  .max(LONGITUD_MAXIMA_MOTIVO, `Máximo ${LONGITUD_MAXIMA_MOTIVO} caracteres.`)

/** Suspender o reactivar: el medio y el motivo (lo recibe el medio en su aviso). */
export const esquemaMotivoMedio = z.object({ medioId: id, motivo })
export type EntradaMotivoMedio = z.input<typeof esquemaMotivoMedio>

/** Asignaciones en curso del medio (al abrir el diálogo de suspensión). */
export const esquemaMedio = z.object({ medioId: id })
export type EntradaMedio = z.input<typeof esquemaMedio>
