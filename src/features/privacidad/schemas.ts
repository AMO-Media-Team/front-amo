/**
 * Esquemas zod de los derechos del titular (CTA-007): los MISMOS en el
 * formulario y en la Server Action. Los límites son los de las restricciones
 * de `solicitudes_titular` y de los `*_srv`, que vuelven a validar todo.
 */
import { z } from "zod"

import {
  esquemaArchivoSubido,
  esquemaDescripcionArchivo,
  type LimitesArchivo,
} from "@/lib/archivos/esquemas"
import { BUCKETS } from "@/lib/archivos/buckets"

import { DATOS_AFECTADOS, DECISIONES_SOLICITUD, TIPOS_SOLICITUD } from "./tipos"

/** `solicitudes_titular_descripcion_chk`. */
export const LIMITES_DESCRIPCION = { minimo: 10, maximo: 2000 } as const
/** `solicitudes_titular_informacion_chk`. */
export const LIMITES_INFORMACION = { minimo: 2, maximo: 2000 } as const
/** `solicitudes_titular_requerimiento_chk`. */
export const LIMITES_REQUERIMIENTO = { minimo: 10, maximo: 2000 } as const
/** `solicitudes_titular_prorroga_motivo_chk`. */
export const LIMITES_PRORROGA = { minimo: 10, maximo: 1000 } as const
/** `solicitudes_titular_respuesta_texto_chk`. */
export const LIMITES_RESPUESTA = { minimo: 20, maximo: 4000 } as const

const id = z.uuid({ error: "Identificador inválido." })

function texto(
  limites: { minimo: number; maximo: number },
  mensajes: { vacio: string; corto: string }
) {
  return z
    .string({ error: mensajes.vacio })
    .trim()
    .min(1, mensajes.vacio)
    .min(limites.minimo, mensajes.corto)
    .max(limites.maximo, `Máximo ${limites.maximo} caracteres.`)
}

// ── Titular ──────────────────────────────────────────────────────────────────

export const esquemaRadicar = z.object({
  tipo: z.enum(TIPOS_SOLICITUD, { error: "Elige qué quieres pedir." }),
  descripcion: texto(LIMITES_DESCRIPCION, {
    vacio: "Cuéntanos qué necesitas.",
    corto: `Describe tu solicitud con al menos ${LIMITES_DESCRIPCION.minimo} caracteres.`,
  }),
  datosAfectados: z
    .array(z.enum(DATOS_AFECTADOS, { error: "Dato desconocido." }))
    .max(DATOS_AFECTADOS.length)
    .refine((datos) => new Set(datos).size === datos.length, {
      error: "Hay datos repetidos.",
    }),
})

export type EntradaRadicar = z.input<typeof esquemaRadicar>

export const esquemaSolicitud = z.object({ solicitudId: id })

export type EntradaSolicitud = z.input<typeof esquemaSolicitud>

export const esquemaAportar = z.object({
  solicitudId: id,
  informacion: texto(LIMITES_INFORMACION, {
    vacio: "Escribe la información que te pedimos.",
    corto: "Escribe la información que te pedimos.",
  }),
})

export type EntradaAportar = z.input<typeof esquemaAportar>

// ── Equipo AMO ───────────────────────────────────────────────────────────────

export const esquemaRequerir = z.object({
  solicitudId: id,
  requerimiento: texto(LIMITES_REQUERIMIENTO, {
    vacio: "Explica qué información necesitas.",
    corto: `Explica qué información necesitas (al menos ${LIMITES_REQUERIMIENTO.minimo} caracteres).`,
  }),
})

export type EntradaRequerir = z.input<typeof esquemaRequerir>

export const esquemaProrrogar = z.object({
  solicitudId: id,
  motivo: texto(LIMITES_PRORROGA, {
    vacio: "Explica al titular por qué necesitas más tiempo.",
    corto: `Explica al titular por qué necesitas más tiempo (al menos ${LIMITES_PRORROGA.minimo} caracteres).`,
  }),
})

export type EntradaProrrogar = z.input<typeof esquemaProrrogar>

/** El soporte de la respuesta es un PDF (`soportes/titular/{id}/{uuid}.pdf`). */
export const LIMITES_SOPORTE: LimitesArchivo = {
  mimes: ["application/pdf"],
  maxBytes: BUCKETS.soportes.maxBytes,
}

/** El formulario «Responder»: decisión y texto; el PDF se valida al elegirlo. */
export const esquemaFormularioRespuesta = z.object({
  solicitudId: id,
  decision: z.enum(DECISIONES_SOLICITUD, { error: "Elige la decisión." }),
  respuesta: texto(LIMITES_RESPUESTA, {
    vacio: "Escribe la respuesta al titular.",
    corto: `Escribe la respuesta al titular (al menos ${LIMITES_RESPUESTA.minimo} caracteres).`,
  }),
})

export type EntradaFormularioRespuesta = z.input<
  typeof esquemaFormularioRespuesta
>

/**
 * «Responder»: la decisión, el texto y, si se adjuntó, la ruta del PDF ya
 * subido y confirmado. La acción comprueba que la ruta sea de la carpeta de
 * ESTA solicitud y la BD vuelve a exigir su forma.
 */
export const esquemaResponder = esquemaFormularioRespuesta.extend({
  soportePath: z.string().trim().min(1).max(300).nullable(),
})

export type EntradaResponder = z.input<typeof esquemaResponder>

/** Firma la subida del soporte: el servidor construye la ruta. */
export const esquemaPrepararSoporte = z.object({
  solicitudId: id,
  archivo: esquemaDescripcionArchivo(LIMITES_SOPORTE),
})

export type EntradaPrepararSoporte = z.input<typeof esquemaPrepararSoporte>

/** Comprueba el soporte subido (peso y tipo) antes de responder. */
export const esquemaConfirmarSoporte = z.object({
  solicitudId: id,
  archivo: esquemaArchivoSubido(LIMITES_SOPORTE),
})

export type EntradaConfirmarSoporte = z.input<typeof esquemaConfirmarSoporte>

/** «Ejecutar supresión»: quien confirma escribe el número de radicado. */
export const esquemaEjecutarSupresion = z.object({
  solicitudId: id,
  radicado: z
    .string({ error: "Escribe el número de radicado." })
    .trim()
    .regex(/^\d{1,12}$/, "Escribe el número de radicado (solo cifras)."),
})

export type EntradaEjecutarSupresion = z.input<typeof esquemaEjecutarSupresion>

export const esquemaExportacionSolicitudes = z.object({
  formato: z.enum(["csv", "xlsx"]),
  filas: z.number().int().min(0).max(10_000),
})

export type EntradaExportacionSolicitudes = z.input<
  typeof esquemaExportacionSolicitudes
>
