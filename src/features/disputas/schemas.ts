/**
 * Entradas de las disputas (módulo puro): los MISMOS esquemas en los
 * formularios y diálogos (cliente) y en las Server Actions. Los límites son
 * los de la BD (`disputas_descripcion_chk`, `disputa_mensajes_mensaje_chk`,
 * `disputas_resolucion_chk`), que lo vuelve a validar todo.
 */
import { z } from "zod"

import {
  LONGITUD_MAXIMA_MOTIVO,
  LONGITUD_MINIMA_MOTIVO,
} from "@/features/usuarios/schemas"
import {
  esquemaArchivoSubido,
  esquemaDescripcionArchivo,
} from "@/lib/archivos/esquemas"
import { Constants } from "@/types/database.types"

import { LIMITES_ADJUNTO } from "./adjuntos"
import type { EstadoAsignacion } from "./tipos"

const ENUMS = Constants.public.Enums

export const LONGITUD_MINIMA_DESCRIPCION = 10
export const LONGITUD_MAXIMA_DESCRIPCION = 4000
export const LONGITUD_MAXIMA_MENSAJE = 4000
export const LONGITUD_MINIMA_RESOLUCION = 10
export const LONGITUD_MAXIMA_RESOLUCION = 2000
/** Largo máximo de `storage.objects.name`. */
const LARGO_MAXIMO_RUTA = 1024

/** Destinos de la asignación al resolver (`EN_DISPUTA → x`, §4.2). */
export const DESTINOS_RESOLUCION = [
  "PUBLICADA",
  "EVIDENCIA_VALIDADA",
  "METRICAS_CARGADAS",
  "VERIFICADA",
  "VENCIDA_SIN_PUBLICAR",
  "CONTENIDO_ENTREGADO",
  "CANCELADA",
] as const satisfies readonly EstadoAsignacion[]

export type DestinoResolucion = (typeof DESTINOS_RESOLUCION)[number]

export function esDestinoResolucion(
  estado: EstadoAsignacion
): estado is DestinoResolucion {
  return (DESTINOS_RESOLUCION as readonly EstadoAsignacion[]).includes(estado)
}

const id = z.uuid({ error: "Identificador inválido." })
const disputaId = id

// ── Apertura (las partes y el equipo) ────────────────────────────────────────

export const esquemaAbrirDisputa = z.object({
  asignacionId: id,
  motivo: z.enum(ENUMS.disputa_motivo, { error: "Elige el motivo." }),
  descripcion: z
    .string({ error: "Describe lo que pasó." })
    .trim()
    .min(
      LONGITUD_MINIMA_DESCRIPCION,
      `Describe lo que pasó (al menos ${LONGITUD_MINIMA_DESCRIPCION} caracteres).`
    )
    .max(
      LONGITUD_MAXIMA_DESCRIPCION,
      `Máximo ${LONGITUD_MAXIMA_DESCRIPCION.toLocaleString("es-CO")} caracteres.`
    ),
})
export type EntradaAbrirDisputa = z.input<typeof esquemaAbrirDisputa>

// ── Hilo ─────────────────────────────────────────────────────────────────────

const interno = z.boolean().optional().default(false)

export const esquemaMensajeDisputa = z.object({
  disputaId,
  mensaje: z
    .string({ error: "Escribe el mensaje." })
    .trim()
    .min(1, "Escribe el mensaje.")
    .max(
      LONGITUD_MAXIMA_MENSAJE,
      `Máximo ${LONGITUD_MAXIMA_MENSAJE.toLocaleString("es-CO")} caracteres.`
    ),
  /** Ruta que devolvió `confirmarAdjuntoDisputa` (el servidor la vuelve a comprobar). */
  adjuntoPath: z.string().min(1).max(LARGO_MAXIMO_RUTA).nullish(),
  interno,
})
export type EntradaMensajeDisputa = z.input<typeof esquemaMensajeDisputa>

export const esquemaPrepararAdjunto = z.object({
  disputaId,
  interno,
  descripcion: esquemaDescripcionArchivo(LIMITES_ADJUNTO),
})
export type EntradaPrepararAdjunto = z.input<typeof esquemaPrepararAdjunto>

export const esquemaConfirmarAdjunto = z.object({
  disputaId,
  interno,
  adjunto: esquemaArchivoSubido(LIMITES_ADJUNTO),
})
export type EntradaConfirmarAdjunto = z.input<typeof esquemaConfirmarAdjunto>

export const esquemaFirmarAdjunto = z.object({
  disputaId,
  mensajeId: z.number().int().positive(),
  /** Firma la descarga (`Content-Disposition: attachment`). */
  descargar: z.boolean().optional().default(false),
})
export type EntradaFirmarAdjunto = z.input<typeof esquemaFirmarAdjunto>

// ── Decisiones del equipo ────────────────────────────────────────────────────

export const esquemaTomarDisputa = z.object({ disputaId })
export type EntradaTomarDisputa = z.input<typeof esquemaTomarDisputa>

export const esquemaResolverDisputa = z
  .object({
    disputaId,
    estadoResultante: z.enum(DESTINOS_RESOLUCION, {
      error: "Elige qué pasa con la asignación.",
    }),
    causa: z.enum(ENUMS.cancelacion_causa).nullish(),
    /** Constancia manual de la permanencia (solo `metricas.editar_validadas`). */
    permanenciaVerificada: z.boolean().optional().default(false),
    motivo: z
      .string({ error: "Explica la decisión." })
      .trim()
      .min(
        LONGITUD_MINIMA_RESOLUCION,
        `Explica la decisión (al menos ${LONGITUD_MINIMA_RESOLUCION} caracteres).`
      )
      .max(
        LONGITUD_MAXIMA_RESOLUCION,
        `Máximo ${LONGITUD_MAXIMA_RESOLUCION.toLocaleString("es-CO")} caracteres.`
      ),
  })
  .superRefine((entrada, contexto) => {
    if (entrada.estadoResultante === "CANCELADA" && !entrada.causa) {
      contexto.addIssue({
        code: "custom",
        path: ["causa"],
        message: "Elige la causa de la cancelación.",
      })
    }
  })
export type EntradaResolverDisputa = z.input<typeof esquemaResolverDisputa>

/** Descartar: los límites de `DialogoMotivo`, que es el diálogo que lo pide. */
export const esquemaDescartarDisputa = z.object({
  disputaId,
  motivo: z
    .string({ error: "Escribe el motivo." })
    .trim()
    .min(
      LONGITUD_MINIMA_MOTIVO,
      `Describe el motivo (al menos ${LONGITUD_MINIMA_MOTIVO} caracteres).`
    )
    .max(
      LONGITUD_MAXIMA_MOTIVO,
      `Máximo ${LONGITUD_MAXIMA_MOTIVO} caracteres.`
    ),
})
export type EntradaDescartarDisputa = z.input<typeof esquemaDescartarDisputa>

export const esquemaExportacionDisputas = z.object({
  formato: z.enum(["csv", "xlsx"]),
  filas: z.number().int().min(0).max(10_000),
})
export type EntradaExportacionDisputas = z.input<
  typeof esquemaExportacionDisputas
>
