import "server-only"

/**
 * Lecturas del documento soporte (contrato de la fase 5). STUB del líder: el paquete DS lo
 * implementa con la sesión (`liquidaciones.ver`) sin cambiar las firmas.
 */
import type { DocumentoSoporteFicha, NumeracionDocumentoSoporte } from "./tipos"

/** Documento soporte de una liquidación (`null` si no lleva o aún no existe). */
export async function documentoSoporteDeLiquidacion(
  _liquidacionId: string
): Promise<DocumentoSoporteFicha | null> {
  return null
}

/** Valor vigente de `tributario.numeracion_documento_soporte`. */
export async function numeracionDocumentoSoporte(): Promise<NumeracionDocumentoSoporte> {
  return "PLATAFORMA"
}
