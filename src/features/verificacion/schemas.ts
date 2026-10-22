/**
 * Entradas de las acciones de verificación (módulo puro): los MISMOS esquemas
 * en el cliente y en las Server Actions. Reflejan los CHECK de la BD
 * (`observaciones` ≤ 1000, `motivo_estado` ≤ 500, multiplicador 0,500–1,500,
 * notas ≤ 500), que vuelve a validarlo todo.
 */
import { z } from "zod"

import { LARGO_MAXIMO_CODIGO, LARGO_MINIMO_CODIGO } from "./codigo"
import {
  LARGO_MAXIMO_NOTAS,
  MULTIPLICADOR_MAXIMO,
  MULTIPLICADOR_MINIMO,
  redondearMultiplicador,
} from "./pertinencia"
import { esDiaValido } from "./vigencia"

export const LIMITES_VERIFICACION = {
  motivoMin: 5,
  /** `medios.motivo_estado` ≤ 500; las observaciones admiten 1000. */
  motivoMax: 500,
  observacionesMax: 1000,
  videollamadaMin: 20,
  seguidoresMax: 1_000_000_000,
} as const

const id = z.uuid({ error: "Identificador inválido." })

function textoOpcional(maximo: number) {
  return z
    .string()
    .trim()
    .max(maximo, `Máximo ${maximo.toLocaleString("es-CO")} caracteres.`)
    .transform((valor) => valor || null)
    .optional()
    .transform((valor) => valor ?? null)
}

const motivo = z
  .string({ error: "Escribe el motivo." })
  .trim()
  .min(
    LIMITES_VERIFICACION.motivoMin,
    `Describe el motivo (al menos ${LIMITES_VERIFICACION.motivoMin} caracteres).`
  )
  .max(
    LIMITES_VERIFICACION.motivoMax,
    `Máximo ${LIMITES_VERIFICACION.motivoMax} caracteres.`
  )

const nivel = z
  .number({ error: "Elige el nivel." })
  .int("Elige el nivel.")
  .min(1, "Elige un nivel entre 1 y 3.")
  .max(3, "Elige un nivel entre 1 y 3.")

// ── Documentos ───────────────────────────────────────────────────────────────

export const esquemaDocumento = z.object({ documentoId: id })
export type EntradaDocumento = z.input<typeof esquemaDocumento>

export const esquemaAprobarDocumento = z.object({
  documentoId: id,
  /** `YYYY-MM-DD`; vacío = sin vencimiento. Que no sea pasada lo revisa el servidor con su «hoy». */
  fechaVencimiento: z
    .string()
    .trim()
    .refine((valor) => valor === "" || esDiaValido(valor), {
      error: "Escribe una fecha válida.",
    })
    .transform((valor) => valor || null)
    .optional()
    .transform((valor) => valor ?? null),
  observaciones: textoOpcional(LIMITES_VERIFICACION.observacionesMax),
})
export type EntradaAprobarDocumento = z.input<typeof esquemaAprobarDocumento>

export const esquemaRechazarDocumento = z.object({ documentoId: id, motivo })
export type EntradaRechazarDocumento = z.input<typeof esquemaRechazarDocumento>

export const esquemaVideollamada = z.object({
  medioId: id,
  observaciones: z
    .string({ error: "Describe cómo se verificó la identidad." })
    .trim()
    .min(
      LIMITES_VERIFICACION.videollamadaMin,
      `Describe la videollamada (al menos ${LIMITES_VERIFICACION.videollamadaMin} caracteres): fecha, quién atendió y qué documento se exhibió.`
    )
    .max(
      LIMITES_VERIFICACION.observacionesMax,
      `Máximo ${LIMITES_VERIFICACION.observacionesMax.toLocaleString("es-CO")} caracteres.`
    ),
})
export type EntradaVideollamada = z.input<typeof esquemaVideollamada>

// ── Cuentas sociales ─────────────────────────────────────────────────────────

export const esquemaVerificacionCuenta = z.object({ verificacionId: id })
export type EntradaVerificacionCuenta = z.input<
  typeof esquemaVerificacionCuenta
>

export const esquemaAprobarCuenta = z.object({
  verificacionId: id,
  seguidoresVerificados: z
    .number({ error: "Escribe los seguidores verificados." })
    .int("Escribe un número entero de seguidores.")
    .min(0, "Los seguidores no pueden ser negativos.")
    .max(LIMITES_VERIFICACION.seguidoresMax, "Revisa la cifra de seguidores."),
  observaciones: textoOpcional(LIMITES_VERIFICACION.observacionesMax),
})
export type EntradaAprobarCuenta = z.input<typeof esquemaAprobarCuenta>

export const esquemaRechazarCuenta = z.object({ verificacionId: id, motivo })
export type EntradaRechazarCuenta = z.input<typeof esquemaRechazarCuenta>

export const esquemaComprobarCodigo = z.object({
  verificacionId: id,
  codigo: z
    .string({ error: "Escribe el código que ves en la captura." })
    .trim()
    .min(LARGO_MINIMO_CODIGO, "Escribe el código completo.")
    .max(LARGO_MAXIMO_CODIGO, "El código es más corto. Revísalo."),
})
export type EntradaComprobarCodigo = z.input<typeof esquemaComprobarCodigo>

// ── Decisión sobre el medio ──────────────────────────────────────────────────

export const esquemaVerificarMedio = z.object({ medioId: id, nivel })
export type EntradaVerificarMedio = z.input<typeof esquemaVerificarMedio>

export const esquemaCambiarNivel = z.object({ medioId: id, nivel, motivo })
export type EntradaCambiarNivel = z.input<typeof esquemaCambiarNivel>

export const esquemaRechazarMedio = z.object({ medioId: id, motivo })
export type EntradaRechazarMedio = z.input<typeof esquemaRechazarMedio>

// ── Pertinencia geográfica (ADM-006) ─────────────────────────────────────────

const multiplicador = z
  .number({ error: "Escribe el multiplicador." })
  .min(
    MULTIPLICADOR_MINIMO,
    "El multiplicador va de 0,500 a 1,500 (1,000 = sin ajuste)."
  )
  .max(
    MULTIPLICADOR_MAXIMO,
    "El multiplicador va de 0,500 a 1,500 (1,000 = sin ajuste)."
  )
  .transform(redondearMultiplicador)

const municipioCodigo = z
  .string({ error: "Elige el municipio." })
  .min(1, { error: "Elige el municipio.", abort: true })
  .regex(/^\d{5}$/, "Elige un municipio de la lista.")

export const esquemaPertinencia = z.object({
  medioId: id,
  municipioCodigo,
  multiplicador,
  notas: textoOpcional(LARGO_MAXIMO_NOTAS),
})
export type EntradaPertinencia = z.input<typeof esquemaPertinencia>

export const esquemaQuitarPertinencia = z.object({
  medioId: id,
  municipioCodigo,
})
export type EntradaQuitarPertinencia = z.input<typeof esquemaQuitarPertinencia>
