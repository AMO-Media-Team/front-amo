/**
 * Entradas de las Server Actions de Accesos (mismo contrato que la URL).
 */
import { z } from "zod"

import { esquemaPeriodo } from "@/features/auditoria/periodo"
import { FORMATOS_EXPORTACION } from "@/features/auditoria/schemas"

import { esquemaFiltrosAccesos } from "./estado-accesos"

export const esquemaExportacionAccesos = z.object({
  periodo: esquemaPeriodo,
  filtros: esquemaFiltrosAccesos,
  formato: z.enum(FORMATOS_EXPORTACION),
})

export type EntradaExportacionAccesos = z.input<
  typeof esquemaExportacionAccesos
>
