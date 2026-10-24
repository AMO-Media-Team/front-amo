/**
 * Errores de «Ganancias» en voz del medio (módulo puro). La BD explica casi
 * todo en el `detail` de sus `AMO_*`; aquí se decide en qué campo del
 * formulario de la factura va cada uno y se da texto propio al hint
 * `archivo_no_cargado`.
 */
import {
  codigoNegocio,
  type ErrorBd,
  type ErrorBdInterpretado,
  interpretarErrorBd,
} from "@/lib/errores-bd"

export const HINT_ARCHIVO_NO_CARGADO = "archivo_no_cargado"

export const MENSAJES_GANANCIAS = {
  sinMedio:
    "Tu cuenta aún no está vinculada a un medio. Escríbele al equipo AMO para que la asocie.",
  noEncontrada:
    "No encontramos esa liquidación o ya no tienes acceso a ella. Actualiza la página.",
  sinArchivo:
    "Este archivo aún no está disponible. Te avisaremos cuando lo esté.",
  anulada:
    "Esta liquidación se anuló: ya no tiene archivos para descargar. Actualiza la página.",
  archivoNoCargado:
    "El PDF de la factura no terminó de subir. Elígelo de nuevo y vuelve a enviarla.",
  archivoAjeno:
    "El archivo recibido no corresponde a esta liquidación. Elígelo de nuevo.",
  archivoRequerido: "Adjunta el PDF de tu factura.",
  noAdmiteFactura:
    "Esta liquidación ya no admite tu factura: ya se pagó o lleva documento soporte.",
} as const

/** Detalle con que la BD pide el número (`registrar_factura_medio_srv`). */
const DETALLE_NUMERO = /número de la factura/i

/**
 * Mensaje, campo del formulario de la factura (`numero` o `archivo`) y si es
 * un error esperado (la persona puede corregirlo) o un fallo que se registra.
 */
export function interpretarErrorGanancias(error: ErrorBd): ErrorBdInterpretado {
  const codigo = codigoNegocio(error)
  if (error.hint === HINT_ARCHIVO_NO_CARGADO) {
    return {
      codigo,
      esperado: true,
      mensaje: MENSAJES_GANANCIAS.archivoNoCargado,
      campo: "archivo",
    }
  }
  const interpretado = interpretarErrorBd(error)
  if (
    codigo === "AMO_CONFIG_INVALIDA" &&
    DETALLE_NUMERO.test(error.details ?? "")
  ) {
    return { ...interpretado, campo: "numero" }
  }
  return interpretado
}
