/**
 * Errores de la verificación → mensajes para la persona (módulo puro). Las
 * reglas de negocio llegan como `AMO_*` con su `detail` (p. ej. los documentos
 * que faltan para un nivel), que aquí se pasa a nombres legibles; las
 * restricciones propias del módulo se nombran con su campo.
 */
import {
  type ErrorBd,
  type ErrorBdInterpretado,
  interpretarErrorBd,
  type Restricciones,
} from "@/lib/errores-bd"

import { humanizarDetalle } from "./presentacion"

export const RESTRICCIONES_VERIFICACION: Restricciones = {
  medio_pertinencia_geografica_pkey: {
    mensaje:
      "Ese municipio ya está clasificado para este medio: cambia su multiplicador en la lista.",
    campo: "municipioCodigo",
  },
  medio_pertinencia_geografica_municipio_codigo_fkey: {
    mensaje: "Elige un municipio de la lista.",
    campo: "municipioCodigo",
  },
  medio_pertinencia_geografica_multiplicador_chk: {
    mensaje: "El multiplicador va de 0,500 a 1,500 (1,000 = sin ajuste).",
    campo: "multiplicador",
  },
  medio_pertinencia_geografica_notas_chk: {
    mensaje: "Las notas admiten hasta 500 caracteres.",
    campo: "notas",
  },
  medio_pertinencia_geografica_medio_id_fkey:
    "El medio ya no existe. Actualiza la página.",
  medios_motivo_estado_chk: {
    mensaje: "El motivo admite hasta 500 caracteres.",
    campo: "motivo",
  },
  documentos_medio_observaciones_chk: {
    mensaje: "Las observaciones admiten hasta 1.000 caracteres.",
    campo: "observaciones",
  },
  verificaciones_cuenta_observaciones_chk: {
    mensaje: "Las observaciones admiten hasta 1.000 caracteres.",
    campo: "observaciones",
  },
  verificaciones_cuenta_verificados_chk: {
    mensaje: "Los seguidores verificados no pueden ser negativos.",
    campo: "seguidoresVerificados",
  },
}

export function interpretarErrorVerificacion(
  error: ErrorBd
): ErrorBdInterpretado {
  const interpretado = interpretarErrorBd(error, RESTRICCIONES_VERIFICACION)
  return { ...interpretado, mensaje: humanizarDetalle(interpretado.mensaje) }
}

export const MENSAJES_VERIFICACION = {
  sinPermisoDocumentos:
    "Ver y revisar documentos de identidad exige además el permiso de datos sensibles.",
  documentoNoEncontrado:
    "No encontramos ese documento o ya no tienes acceso a él. Actualiza la página.",
  documentoSinArchivo:
    "Este documento no tiene archivo: la identidad se verificó por videollamada.",
  verificacionNoEncontrada:
    "No encontramos esa verificación o ya no tienes acceso a ella. Actualiza la página.",
  verificacionSinCaptura: "El medio aún no carga la captura de esta cuenta.",
  sinCodigo: "Esta verificación no usa código temporal.",
  vigenciaPasada: "La vigencia no puede ser anterior a hoy.",
  medioNoEncontrado:
    "No encontramos ese medio o ya no tienes acceso a él. Actualiza la página.",
  municipioDesconocido: "Elige un municipio de la lista.",
  pertinenciaNoEncontrada:
    "Ese municipio ya no está clasificado. Actualiza la página.",
} as const
