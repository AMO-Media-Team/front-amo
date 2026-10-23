/**
 * Entradas de las Server Actions de operación (mismo esquema en cliente y
 * servidor). Nunca aceptan rutas de archivos ni nombres de columnas: el
 * servidor las deriva de ids ya validados.
 */
import { z } from "zod"

import {
  LONGITUD_MAXIMA_MOTIVO,
  LONGITUD_MINIMA_MOTIVO,
} from "@/features/usuarios/schemas"
import { Constants } from "@/types/database.types"

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

// ── Gestión de una asignación (ADM-010, ADM-011) ─────────────────────────────

const ENUMS = Constants.public.Enums

const motivo = z
  .string({ error: "Escribe el motivo." })
  .trim()
  .min(
    LONGITUD_MINIMA_MOTIVO,
    `Describe el motivo (al menos ${LONGITUD_MINIMA_MOTIVO} caracteres).`
  )
  .max(LONGITUD_MAXIMA_MOTIVO, `Máximo ${LONGITUD_MAXIMA_MOTIVO} caracteres.`)

/**
 * Cancelar con causa (`cancelar_asignacion_srv`). `estadoVisto` es el que
 * mostraba la ficha al abrir el diálogo: si cambió mientras tanto, la acción
 * no cancela sin que lo revisen. La suspensión solo acompaña al fraude o al
 * incumplimiento del medio (la BD también lo exige).
 */
export const esquemaCancelarAsignacion = z
  .object({
    asignacionId: z.uuid({ error: "Identificador inválido." }),
    estadoVisto: z.enum(ENUMS.asignacion_estado),
    causa: z.enum(ENUMS.cancelacion_causa, {
      error: "Elige la causa de la cancelación.",
    }),
    motivo,
    suspenderMedio: z.boolean().default(false),
  })
  .refine(
    (entrada) =>
      !entrada.suspenderMedio ||
      entrada.causa === "FRAUDE" ||
      entrada.causa === "INCUMPLIMIENTO_MEDIO",
    {
      path: ["suspenderMedio"],
      message:
        "La suspensión solo acompaña una cancelación por fraude o por incumplimiento del medio.",
    }
  )

export type EntradaCancelarAsignacion = z.input<
  typeof esquemaCancelarAsignacion
>

/** Lo que admite la BD en `disputas.descripcion` (`disputas_descripcion_chk`). */
export const LONGITUD_DESCRIPCION_DISPUTA = {
  minima: 10,
  maxima: 4000,
} as const

/** Abrir una disputa como equipo AMO (`abrir_disputa_srv`). */
export const esquemaAbrirDisputa = z.object({
  asignacionId: z.uuid({ error: "Identificador inválido." }),
  motivo: z.enum(ENUMS.disputa_motivo, {
    error: "Elige el motivo de la disputa.",
  }),
  descripcion: z
    .string({ error: "Describe qué pasó." })
    .trim()
    .min(
      LONGITUD_DESCRIPCION_DISPUTA.minima,
      `Describe qué pasó (al menos ${LONGITUD_DESCRIPCION_DISPUTA.minima} caracteres).`
    )
    .max(
      LONGITUD_DESCRIPCION_DISPUTA.maxima,
      `Máximo ${LONGITUD_DESCRIPCION_DISPUTA.maxima.toLocaleString("es-CO")} caracteres.`
    ),
})

export type EntradaAbrirDisputa = z.input<typeof esquemaAbrirDisputa>
