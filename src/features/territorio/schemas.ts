import { z } from "zod"

import { normalizarSegmentacion } from "./segmentacion"

export const esquemaCodigoDepartamento = z
  .string({ error: "Elige un departamento." })
  .trim()
  .regex(/^\d{2}$/, "Elige un departamento válido.")

export const esquemaCodigoMunicipio = z
  .string({ error: "Elige un municipio." })
  .trim()
  .regex(/^\d{5}$/, "Elige un municipio válido.")

/** 33 departamentos y 1.122 municipios: un tope que nadie legítimo supera. */
const MAXIMO_DEPARTAMENTOS = 33
const MAXIMO_MUNICIPIOS = 1_122

/**
 * Segmentación geográfica (mismo esquema en cliente y servidor). Se
 * normaliza: sin repetidos y sin municipios ya cubiertos por su departamento
 * completo. Si vacía, la oferta llega a todo el país.
 */
export const esquemaSegmentacion = z
  .object({
    departamentos: z
      .array(esquemaCodigoDepartamento)
      .max(MAXIMO_DEPARTAMENTOS, "Demasiados departamentos."),
    municipios: z
      .array(esquemaCodigoMunicipio)
      .max(MAXIMO_MUNICIPIOS, "Demasiados municipios."),
  })
  .transform(normalizarSegmentacion)

export type EntradaSegmentacion = z.input<typeof esquemaSegmentacion>
