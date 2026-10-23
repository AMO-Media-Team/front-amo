/**
 * Errores de la BD al cambiar el estado de una oferta → mensaje, campo y
 * paso del asistente (módulo puro). El envío a revisión trae en el `hint` el
 * paso que falta (`envio_oferta:<paso>`) y en el `detail` qué corregir.
 */
import { type PasoOferta, pasoDeHint } from "@/features/asistente-oferta/pasos"
import {
  codigoNegocio,
  type ErrorBd,
  interpretarErrorBd,
  type Restricciones,
} from "@/lib/errores-bd"

const RESTRICCIONES_OFERTA: Restricciones = {
  ofertas_comentario_chk: {
    mensaje: "El comentario admite hasta 2.000 caracteres.",
    campo: "motivo",
  },
  oferta_historial_comentario_chk: {
    mensaje: "El comentario admite hasta 2.000 caracteres.",
    campo: "motivo",
  },
}

export interface ErrorOferta {
  mensaje: string
  /** Campo del formulario donde mostrarlo (el motivo de un diálogo). */
  campo?: string
  /** Paso del asistente que falta completar (solo en el envío). */
  paso: PasoOferta | null
  esperado: boolean
}

export function interpretarErrorOferta(error: ErrorBd): ErrorOferta {
  const base = interpretarErrorBd(error, RESTRICCIONES_OFERTA)
  // Sin motivo, la BD responde con un mensaje que va junto al campo.
  const campo =
    base.campo ??
    (codigoNegocio(error) === "AMO_MOTIVO_REQUERIDO" ? "motivo" : undefined)
  return {
    mensaje: base.mensaje,
    ...(campo ? { campo } : {}),
    paso: pasoDeHint(error.hint),
    esperado: base.esperado,
  }
}
