/**
 * Errores de las liquidaciones en voz del equipo (módulo puro). La BD explica
 * casi todo en el `detail` de sus `AMO_*` (periodo abierto, traslape, D17,
 * «Seguridad social pendiente: …»); aquí se decide en qué campo mostrarlo y
 * se da texto propio a los `hint` de la fase (`periodo_abierto`,
 * `requiere_nota_ajuste`, `archivo_no_cargado`, `liquidacion_integridad`).
 */
import {
  codigoNegocio,
  type ErrorBd,
  type ErrorBdInterpretado,
  interpretarErrorBd,
} from "@/lib/errores-bd"

import { TEXTO_REQUIERE_NOTA_AJUSTE } from "./presentacion"

export const HINT_PERIODO_ABIERTO = "periodo_abierto"
export const HINT_REQUIERE_NOTA_AJUSTE = "requiere_nota_ajuste"
export const HINT_ARCHIVO_NO_CARGADO = "archivo_no_cargado"
export const HINT_INTEGRIDAD = "liquidacion_integridad"

export const MENSAJES_LIQUIDACION = {
  noEncontrada:
    "No encontramos esa liquidación o ya no tienes acceso a ella. Actualiza la página.",
  archivoNoCargado:
    "El PDF de la factura no terminó de subir: cárgalo de nuevo.",
  archivoAjeno:
    "El archivo recibido no corresponde a esta liquidación. Súbelo de nuevo.",
  integridad:
    "Las asignaciones de la liquidación ya no cuadran con sus montos (alguna cambió de estado). Anúlala y genera un corte nuevo.",
  sinArchivo: "Esta liquidación no tiene ese archivo.",
  respuestaCorte:
    "El corte se generó, pero no pudimos leer el resultado. Actualiza la página para ver las liquidaciones nuevas.",
} as const

/** Qué operación respondió con error (decide el campo y el texto). */
export type OperacionLiquidacion =
  "corte" | "liquidar" | "aprobar" | "anular" | "factura"

export interface ErrorLiquidacion extends ErrorBdInterpretado {
  /** El documento soporte transmitido pide su nota de ajuste antes de anular. */
  requiereNotaAjuste: boolean
}

export function interpretarErrorLiquidacion(
  error: ErrorBd,
  operacion: OperacionLiquidacion
): ErrorLiquidacion {
  const base = interpretarErrorBd(error)
  const resultado = (cambios: Partial<ErrorLiquidacion> = {}) => ({
    ...base,
    requiereNotaAjuste: false,
    ...cambios,
  })

  switch (error.hint) {
    case HINT_PERIODO_ABIERTO:
      return resultado({ campo: "fin" })
    case HINT_REQUIERE_NOTA_AJUSTE:
      return resultado({
        mensaje: TEXTO_REQUIERE_NOTA_AJUSTE,
        requiereNotaAjuste: true,
      })
    case HINT_ARCHIVO_NO_CARGADO:
      return resultado({
        mensaje: MENSAJES_LIQUIDACION.archivoNoCargado,
        campo: "archivo",
      })
    case HINT_INTEGRIDAD:
      return resultado({ mensaje: MENSAJES_LIQUIDACION.integridad })
  }

  // El número de la factura que la BD no admite (sin hint) va a su campo.
  if (
    operacion === "factura" &&
    codigoNegocio(error) === "AMO_CONFIG_INVALIDA"
  ) {
    return resultado({ campo: "numero" })
  }
  return resultado()
}

export const MENSAJE_MEDIO_SIN_LIQUIDAR =
  "No pudimos liquidar este medio. Inténtalo con «Liquidar» en su fila de «Por liquidar»."

/**
 * El error de un medio en el corte (`generar_liquidaciones_corte_srv`
 * devuelve el `detail` del `AMO_*`, ya escrito para la persona, o el mensaje
 * de Postgres). Solo se muestra el texto de la plataforma: frases en español
 * que terminan en punto; un código suelto se traduce con el catálogo y un
 * mensaje técnico se reemplaza.
 */
export function textoErrorCorte(texto: string | null | undefined): string {
  const limpio = texto?.trim() ?? ""
  if (!limpio) return MENSAJE_MEDIO_SIN_LIQUIDAR
  const codigo = codigoNegocio({ message: limpio })
  if (codigo) {
    return codigo === limpio
      ? interpretarErrorBd({ message: codigo }).mensaje
      : MENSAJE_MEDIO_SIN_LIQUIDAR
  }
  return /[.!]$/.test(limpio) && /^[A-ZÁÉÍÓÚÑ¿]/.test(limpio)
    ? limpio
    : MENSAJE_MEDIO_SIN_LIQUIDAR
}
