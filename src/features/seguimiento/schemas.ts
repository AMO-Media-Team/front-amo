/**
 * Entradas de las acciones del seguimiento (mismo esquema en cliente y
 * servidor). Solo viajan identificadores: las rutas de Storage salen siempre
 * de la fila que la sesión puede leer.
 */
import { z } from "zod"

const uuid = (mensaje: string) => z.uuid({ message: mensaje })

export const esquemaConsultaSeguimiento = z.object({
  campanaId: uuid("La campaña no es válida."),
})

export type EntradaConsultaSeguimiento = z.input<
  typeof esquemaConsultaSeguimiento
>

export const VARIANTES_CAPTURA = ["miniatura", "original"] as const

export type VarianteCaptura = (typeof VARIANTES_CAPTURA)[number]

export const esquemaFirmaCaptura = z.object({
  publicacionId: uuid("La publicación no es válida."),
  /** La miniatura para la tarjeta; el original para verla en grande. */
  variante: z.enum(VARIANTES_CAPTURA).default("original"),
  /** Firma para descargar (`Content-Disposition: attachment`). */
  descargar: z.boolean().default(false),
})

export type EntradaFirmaCaptura = z.input<typeof esquemaFirmaCaptura>

export const esquemaPerfilMedio = z.object({
  medioId: uuid("El medio no es válido."),
})

export type EntradaPerfilMedio = z.input<typeof esquemaPerfilMedio>
