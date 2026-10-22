/**
 * Esquemas zod de lo que el navegador envía a `preparar` y `confirmar`. Cada
 * feature los arma con los límites de su caso (bucket o reglas propias) y los
 * usa en su `schemas.ts`; el servidor nunca acepta una ruta sin comprobar que
 * cae en la carpeta que él mismo construye, con su miniatura y en su bucket
 * (`archivoPerteneceA` de `@/lib/storage/rutas`).
 */
import { z } from "zod"

import { NOMBRES_BUCKETS } from "./buckets"
import { mensajeFormatoNoAdmitido } from "./mime"
import { formatearTamano } from "./formato"

export interface LimitesArchivo {
  mimes: readonly string[]
  maxBytes: number
}

const LADO_MAXIMO_PX = 20_000
const DURACION_MAXIMA_S = 24 * 60 * 60
const LARGO_MAXIMO_RUTA = 1024

const esquemaDimensiones = z.object({
  ancho: z.number().int().positive().max(LADO_MAXIMO_PX),
  alto: z.number().int().positive().max(LADO_MAXIMO_PX),
})

export function esquemaDescripcionArchivo(limites: LimitesArchivo) {
  return z.object({
    nombre: z
      .string()
      .trim()
      .min(1, "El archivo no tiene nombre.")
      .max(255, "El nombre del archivo es demasiado largo."),
    tipo: z.string().refine((tipo) => limites.mimes.includes(tipo), {
      message: mensajeFormatoNoAdmitido(limites.mimes),
    }),
    tamano: z
      .number()
      .int()
      .positive("El archivo está vacío.")
      .max(
        limites.maxBytes,
        `El archivo supera el máximo de ${formatearTamano(limites.maxBytes)}.`
      ),
    sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/, "La huella del archivo no es válida.")
      .nullable(),
    dimensiones: esquemaDimensiones.nullable(),
    duracionSeg: z.number().nonnegative().max(DURACION_MAXIMA_S).nullable(),
    conMiniatura: z.boolean(),
  })
}

export function esquemaArchivoSubido(limites: LimitesArchivo) {
  return esquemaDescripcionArchivo(limites).extend({
    bucket: z.enum(NOMBRES_BUCKETS),
    ruta: z.string().min(1).max(LARGO_MAXIMO_RUTA),
    rutaMiniatura: z.string().min(1).max(LARGO_MAXIMO_RUTA).nullable(),
  })
}
