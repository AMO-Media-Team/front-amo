/**
 * Entradas de las Server Actions de las facturas del anunciante. El cliente
 * solo nombra QUÉ archivo quiere (factura, soporte de un pago o nota
 * crédito, por el id de su fila): la ruta en Storage la toma el servidor de
 * esa fila, leída con la sesión.
 */
import { z } from "zod"

import type { TipoArchivoFactura } from "./tipos"

export const TIPOS_ARCHIVO_FACTURA = [
  "factura",
  "pago",
  "nota_credito",
] as const satisfies readonly TipoArchivoFactura[]

export const esquemaArchivoFactura = z.object({
  tipo: z.enum(TIPOS_ARCHIVO_FACTURA, { error: "Archivo no reconocido." }),
  id: z.uuid({ error: "El archivo no es válido." }),
  /** Como adjunto con un nombre legible (si no, el navegador lo muestra). */
  descargar: z.boolean().optional(),
})

export type EntradaArchivoFactura = z.input<typeof esquemaArchivoFactura>
