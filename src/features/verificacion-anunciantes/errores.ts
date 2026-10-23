/**
 * Errores de la verificación de anunciantes → mensajes para la persona (módulo
 * puro). Las reglas de negocio llegan como `AMO_*` con su `detail` ya legible
 * (p. ej. «Faltan documentos aprobados y vigentes: RUT, Cámara de Comercio.»);
 * las restricciones propias se nombran con su campo.
 */
import {
  type ErrorBd,
  type ErrorBdInterpretado,
  interpretarErrorBd,
  type Restricciones,
} from "@/lib/errores-bd"

export const RESTRICCIONES_VERIFICACION_ANUNCIANTE: Restricciones = {
  anunciantes_motivo_estado_chk: {
    mensaje: "El motivo admite hasta 500 caracteres.",
    campo: "motivo",
  },
  documentos_anunciante_observaciones_chk: {
    mensaje: "Las observaciones admiten hasta 1.000 caracteres.",
    campo: "observaciones",
  },
  documentos_anunciante_archivo_path_chk:
    "El archivo no quedó guardado en la carpeta de este documento. Súbelo de nuevo.",
  documentos_anunciante_archivo_path_key:
    "Este archivo ya estaba registrado. Actualiza la página para verlo.",
  documentos_anunciante_anunciante_id_fkey:
    "La empresa ya no existe. Actualiza la página.",
}

export function interpretarErrorVerificacionAnunciante(
  error: ErrorBd
): ErrorBdInterpretado {
  return interpretarErrorBd(error, RESTRICCIONES_VERIFICACION_ANUNCIANTE)
}

export const MENSAJES_VERIFICACION_ANUNCIANTE = {
  documentoNoEncontrado:
    "No encontramos ese documento o ya no tienes acceso a él. Actualiza la página.",
  vigenciaPasada: "La vigencia no puede ser anterior a hoy.",
  sinPermisoCarga:
    "Cargar documentos por cuenta de la empresa exige además el permiso de verificar anunciantes.",
  archivoInvalido:
    "No pudimos validar el archivo. Elígelo de nuevo e inténtalo otra vez.",
} as const
