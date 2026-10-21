/**
 * Entradas de las Server Actions de Auditoría (mismo contrato que la URL).
 */
import { z } from "zod"

import { esquemaFiltrosBitacora } from "./estado-bitacora"
import { esquemaPeriodo } from "./periodo"

export const esquemaCursor = z.object({
  at: z.iso.datetime({ offset: true }),
  id: z.number().int().positive(),
})

export const esquemaTramo = z.object({
  periodo: esquemaPeriodo,
  filtros: esquemaFiltrosBitacora,
  cursor: esquemaCursor,
})

export type EntradaTramo = z.input<typeof esquemaTramo>

export const FORMATOS_EXPORTACION = ["xlsx", "csv"] as const

export const esquemaExportacionBitacora = z.object({
  periodo: esquemaPeriodo,
  filtros: esquemaFiltrosBitacora,
  formato: z.enum(FORMATOS_EXPORTACION),
})

export type EntradaExportacionBitacora = z.input<
  typeof esquemaExportacionBitacora
>
