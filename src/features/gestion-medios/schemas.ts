/**
 * Esquemas zod del registro y la edición de medios por el equipo AMO: los
 * MISMOS en el formulario (cliente, con `zodResolver`) y en las Server
 * Actions. Reflejan los CHECK de `public.medios` (nombre 2–120, descripción
 * ≤ 1000) para que el error llegue al campo antes de ir a la BD, que vuelve a
 * validarlo todo (RLS, municipio activo, auditoría). Módulo puro: no importa
 * el diccionario de municipios (la existencia del código se revisa en el
 * servidor).
 */
import { z } from "zod"

import { Constants } from "@/types/database.types"

export const TIPOS_MEDIO_BD = Constants.public.Enums.medio_tipo

export const LIMITES_MEDIO = {
  nombreMin: 2,
  nombreMax: 120,
  descripcionMax: 1000,
  categoriasMax: 10,
} as const

/** Colapsa espacios repetidos (también saltos de línea) y recorta los extremos. */
export function normalizarEspacios(texto: string): string {
  return texto.replace(/\s+/g, " ").trim()
}

/** Recorta y deja como máximo una línea en blanco seguida (párrafos legibles). */
export function normalizarParrafos(texto: string): string {
  return texto
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

const id = z.uuid({ error: "Identificador inválido." })

const nombre = z
  .string({ error: "Escribe el nombre del medio." })
  .transform(normalizarEspacios)
  .pipe(
    z
      .string()
      .min(1, { error: "Escribe el nombre del medio.", abort: true })
      .min(
        LIMITES_MEDIO.nombreMin,
        `Escribe al menos ${LIMITES_MEDIO.nombreMin} caracteres.`
      )
      .max(
        LIMITES_MEDIO.nombreMax,
        `Máximo ${LIMITES_MEDIO.nombreMax} caracteres.`
      )
  )

const tipo = z
  .string({ error: "Elige el tipo de medio." })
  .min(1, "Elige el tipo de medio.")
  .pipe(z.enum(TIPOS_MEDIO_BD, { error: "Elige un tipo de la lista." }))

const municipioCodigo = z
  .string({ error: "Elige el municipio." })
  .min(1, { error: "Elige el municipio.", abort: true })
  .regex(/^\d{5}$/, "Elige un municipio de la lista.")

const descripcionAudiencia = z
  .string()
  .transform(normalizarParrafos)
  .pipe(
    z
      .string()
      .max(
        LIMITES_MEDIO.descripcionMax,
        `Máximo ${LIMITES_MEDIO.descripcionMax.toLocaleString("es-CO")} caracteres.`
      )
  )
  .transform((valor) => valor || null)

const categoriaIds = z
  .array(id, { error: "Elige las categorías de la lista." })
  .max(
    LIMITES_MEDIO.categoriasMax,
    `Elige como máximo ${LIMITES_MEDIO.categoriasMax} categorías.`
  )
  .refine(
    (ids) => new Set(ids).size === ids.length,
    "Cada categoría se elige una sola vez."
  )

export const esquemaRegistrarMedio = z.object({
  nombre,
  tipo,
  municipioCodigo,
  descripcionAudiencia,
  categoriaIds,
})

export const esquemaEditarMedio = esquemaRegistrarMedio.extend({
  medioId: id,
  /** `updated_at` que la persona tenía a la vista (bloqueo optimista). */
  actualizadoAt: z
    .string({ error: "Falta la versión del registro." })
    .min(1, "Falta la versión del registro.")
    .max(64, "Versión del registro inválida."),
})

export type EntradaRegistrarMedio = z.input<typeof esquemaRegistrarMedio>
export type DatosRegistrarMedio = z.output<typeof esquemaRegistrarMedio>
export type EntradaEditarMedio = z.input<typeof esquemaEditarMedio>
export type DatosEditarMedio = z.output<typeof esquemaEditarMedio>

/** Campos del formulario que pueden recibir un error del servidor. */
export const CAMPOS_MEDIO = [
  "nombre",
  "tipo",
  "municipioCodigo",
  "descripcionAudiencia",
  "categoriaIds",
] as const satisfies readonly (keyof EntradaRegistrarMedio)[]

export type CampoMedio = (typeof CAMPOS_MEDIO)[number]

export const VALORES_REGISTRO: EntradaRegistrarMedio = {
  nombre: "",
  tipo: "",
  municipioCodigo: "",
  descripcionAudiencia: "",
  categoriaIds: [],
}
