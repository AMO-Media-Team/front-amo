/**
 * Mensajes de «Mi empresa › Documentos» (módulo puro): los errores de la BD
 * se traducen con el catálogo común (`interpretarErrorBd`) más las
 * restricciones propias de `documentos_anunciante`.
 */
import type { z } from "zod"

import {
  type ErrorBd,
  type ErrorBdInterpretado,
  interpretarErrorBd,
  type Restricciones,
} from "@/lib/errores-bd"

export const SIN_EMPRESA =
  "Tu cuenta no está vinculada a una empresa. Escríbele al equipo de AMO para revisarla."

export const ARCHIVO_INVALIDO =
  "No pudimos validar el archivo. Elígelo de nuevo e inténtalo otra vez."

const RESTRICCIONES_DOCUMENTOS: Restricciones = {
  documentos_anunciante_archivo_path_chk:
    "El archivo no quedó guardado en la carpeta de este documento. Súbelo de nuevo.",
  documentos_anunciante_archivo_path_key:
    "Este archivo ya estaba registrado. Actualiza la página para verlo.",
}

export function interpretarErrorDocumentoAnunciante(
  error: ErrorBd
): ErrorBdInterpretado {
  return interpretarErrorBd(error, RESTRICCIONES_DOCUMENTOS)
}

/**
 * Una subida no tiene campos que marcar: se muestra el primer motivo del
 * rechazo («El archivo supera el máximo de 10 MB.») junto al archivo.
 */
export function mensajeValidacion(error: z.ZodError): string {
  return error.issues[0]?.message ?? ARCHIVO_INVALIDO
}
