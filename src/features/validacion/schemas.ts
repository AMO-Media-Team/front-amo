/**
 * Entradas de la validación (módulo puro): los MISMOS esquemas en los
 * formularios y diálogos (cliente) y en las Server Actions. Los límites del
 * motivo siguen los de `DialogoMotivo` (la BD admite hasta 1.000 caracteres
 * en las observaciones y lo vuelve a validar). La corrección de una métrica
 * reutiliza el esquema de la carga del medio (`esquemaMetricas`) y sus reglas
 * de coherencia (`conReglasMetricas`): una corrección no puede dejar lo que la
 * BD rechazaría.
 *
 * Aprobar o rechazar decide sobre la versión que se mostró (`enviadaAt`): los
 * formularios no la editan, la añade quien llama a la acción.
 */
import { z } from "zod"

import { esquemaMetricas } from "@/features/ejecucion/schemas"
import {
  LONGITUD_MAXIMA_MOTIVO,
  LONGITUD_MINIMA_MOTIVO,
} from "@/features/usuarios/schemas"

import { MENSAJES_VALIDACION } from "./errores"

/** `corregir_metrica_srv` exige al menos 10 caracteres de motivo. */
export const LONGITUD_MINIMA_MOTIVO_CORRECCION = 10

const id = z.uuid({ error: "Identificador inválido." })

const observacionesOpcionales = z
  .string({ error: "Revisa las observaciones." })
  .trim()
  .max(LONGITUD_MAXIMA_MOTIVO, `Máximo ${LONGITUD_MAXIMA_MOTIVO} caracteres.`)

const observacionesObligatorias = observacionesOpcionales.min(
  LONGITUD_MINIMA_MOTIVO,
  `Describe qué debe corregir el medio (al menos ${LONGITUD_MINIMA_MOTIVO} caracteres).`
)

/**
 * Versión de la evidencia o la métrica que vio quien decide: su `updated_at`
 * tal cual lo entrega la BD (con sus microsegundos: no se convierte a
 * `Date`). Si el medio la cambió mientras tanto, la BD rechaza la decisión
 * (hints `evidencia_cambiada` y `metrica_cambiada`).
 */
const enviadaAt = z.iso.datetime({
  offset: true,
  error: "No sabemos qué versión revisaste. Actualiza la página.",
})

// ── Evidencias (ADM-007) ─────────────────────────────────────────────────────

/** Aprobar: la etiqueta de publicidad se comprobó a la vista. */
export const esquemaAprobarEvidencia = z.object({
  publicacionId: id,
  etiquetaVerificada: z
    .boolean()
    .refine((marcada) => marcada, MENSAJES_VALIDACION.etiquetaRequerida),
  observaciones: observacionesOpcionales,
})
export type ValoresAprobarEvidencia = z.input<typeof esquemaAprobarEvidencia>

export const esquemaRechazarEvidencia = z.object({
  publicacionId: id,
  observaciones: observacionesObligatorias,
})

export const esquemaValidarEvidencia = z.discriminatedUnion("aprobar", [
  esquemaAprobarEvidencia.extend({ aprobar: z.literal(true), enviadaAt }),
  esquemaRechazarEvidencia.extend({ aprobar: z.literal(false), enviadaAt }),
])
export type EntradaValidarEvidencia = z.input<typeof esquemaValidarEvidencia>

export const CAMPOS_EVIDENCIA = ["etiquetaVerificada", "observaciones"] as const

// ── Métricas (ADM-008) ───────────────────────────────────────────────────────

/**
 * Aprobar: con alerta hay que anotar qué se revisó (la BD lo exige con el
 * hint `alerta_sin_revision`; `conAlerta` solo adelanta el aviso en pantalla).
 */
export const esquemaAprobarMetrica = z
  .object({
    metricaId: id,
    conAlerta: z.boolean(),
    observaciones: observacionesOpcionales,
  })
  .superRefine((valores, contexto) => {
    if (
      valores.conAlerta &&
      valores.observaciones.length < LONGITUD_MINIMA_MOTIVO
    ) {
      contexto.addIssue({
        code: "custom",
        path: ["observaciones"],
        message: MENSAJES_VALIDACION.alertaSinRevision,
      })
    }
  })
export type ValoresAprobarMetrica = z.input<typeof esquemaAprobarMetrica>

export const esquemaRechazarMetrica = z.object({
  metricaId: id,
  observaciones: observacionesObligatorias,
})

export const esquemaValidarMetrica = z.discriminatedUnion("aprobar", [
  esquemaAprobarMetrica.extend({ aprobar: z.literal(true), enviadaAt }),
  esquemaRechazarMetrica.extend({ aprobar: z.literal(false), enviadaAt }),
])
export type EntradaValidarMetrica = z.input<typeof esquemaValidarMetrica>

export const CAMPOS_METRICA = ["observaciones"] as const

/** Corrección auditada de una métrica aprobada (ADM-008 c2). */
export const esquemaCorreccion = esquemaMetricas.extend({
  metricaId: id,
  motivo: z
    .string({ error: "Explica qué corriges y por qué." })
    .trim()
    .min(
      LONGITUD_MINIMA_MOTIVO_CORRECCION,
      `Explica qué corriges y por qué (al menos ${LONGITUD_MINIMA_MOTIVO_CORRECCION} caracteres).`
    )
    .max(
      LONGITUD_MAXIMA_MOTIVO,
      `Máximo ${LONGITUD_MAXIMA_MOTIVO} caracteres.`
    ),
})
export type ValoresCorreccion = z.input<typeof esquemaCorreccion>

export const esquemaLeerCorreccion = z.object({ metricaId: id })
export type EntradaLeerCorreccion = z.input<typeof esquemaLeerCorreccion>

// ── Verificación (ADM-009) ───────────────────────────────────────────────────

/**
 * Verificar la asignación. Con `constancia` se deja constancia manual de que
 * la publicación sigue en línea antes de cumplir la permanencia (solo con
 * `metricas.editar_validadas`): el motivo es obligatorio.
 */
export const esquemaVerificar = z
  .object({
    asignacionId: id,
    constancia: z.boolean(),
    motivo: z
      .string()
      .trim()
      .max(
        LONGITUD_MAXIMA_MOTIVO,
        `Máximo ${LONGITUD_MAXIMA_MOTIVO} caracteres.`
      ),
  })
  .superRefine((valores, contexto) => {
    if (valores.constancia && valores.motivo.length < LONGITUD_MINIMA_MOTIVO) {
      contexto.addIssue({
        code: "custom",
        path: ["motivo"],
        message: `Anota qué comprobaste (al menos ${LONGITUD_MINIMA_MOTIVO} caracteres).`,
      })
    }
  })
export type EntradaVerificar = z.input<typeof esquemaVerificar>
