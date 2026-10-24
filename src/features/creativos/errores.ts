/**
 * Mensajes del paquete creativo (módulo puro): los errores de la BD se
 * traducen con el catálogo común (`interpretarErrorBd`; los `AMO_*` traen su
 * `detail` ya escrito, p. ej. «La relación de aspecto debe ser 9:16.») más las
 * restricciones propias de `creativos` y `creativo_archivos`.
 */
import type { z } from "zod"

import {
  type ErrorBd,
  type ErrorBdInterpretado,
  interpretarErrorBd,
  type Restricciones,
} from "@/lib/errores-bd"

import { MAX_HASHTAGS, MAX_MENCIONES } from "./textos"

export const MENSAJES_CREATIVO = {
  ofertaNoEncontrada:
    "No encontramos la oferta o ya no tienes acceso a ella. Actualiza la página.",
  creativoNoEncontrado:
    "No encontramos esta versión del creativo. Actualiza la página para ver la vigente.",
  archivoNoEncontrado:
    "No encontramos el archivo o ya se quitó. Actualiza la página.",
  enRevision:
    "La oferta está en revisión. Retírala de revisión para cambiar el creativo.",
  publicada:
    "La oferta ya está publicada: para cambiar el creativo prepara una versión nueva.",
  cerrada: "Esta oferta ya no admite cambios en el creativo.",
  soloLectura: "Puedes consultar el creativo, pero no cambiarlo.",
  noEditable:
    "Esta versión del creativo ya no se puede cambiar. Actualiza la página para ver la vigente.",
  sinPublicar:
    "La oferta aún no está publicada: cambia el paquete creativo directamente.",
  pendienteExiste:
    "Ya hay una versión nueva en preparación. Termínala y actívala antes de crear otra.",
  tipoConArchivos:
    "Quita los archivos cargados para cambiar el tipo de creativo.",
  tipoPendiente:
    "La versión en preparación ya tiene su tipo: carga archivos de ese tipo.",
  /** El mismo texto que la BD (`tipo_creativo_valido`) y el paso del asistente. */
  tipoNoAdmitido: "El tipo de creativo no corresponde al formato elegido.",
  tipoVigenteNoAdmitido:
    "El tipo de creativo de la versión vigente no corresponde al formato elegido: empieza la versión nueva desde cero.",
  ordenDistinto:
    "La lista de archivos cambió mientras la ordenabas. Actualiza la página e inténtalo de nuevo.",
  ordenFallido:
    "No pudimos guardar el orden nuevo. Actualiza la página para ver cómo quedó e inténtalo de nuevo.",
  soloPendiente:
    "Solo se puede descartar una versión en preparación: la vigente y las anteriores se conservan.",
  archivoInvalido:
    "No pudimos validar el archivo. Elígelo de nuevo e inténtalo otra vez.",
  /**
   * La BD (`activar_creativo_srv`) exige la empresa VERIFICADA. Sin «tu
   * empresa»: lo leen el anunciante y el equipo AMO en la gestión asistida.
   */
  empresaSuspendida:
    "La empresa está suspendida: puedes preparar la versión nueva, pero solo se podrá activar cuando AMO reactive la cuenta. Mientras tanto, los medios siguen con la versión vigente.",
  empresaSinVerificar:
    "La empresa no está verificada: puedes preparar la versión nueva, pero solo se podrá activar cuando AMO la verifique. Mientras tanto, los medios siguen con la versión vigente.",
} as const

const CAMBIO_SIMULTANEO =
  "Otra persona cambió el creativo al mismo tiempo. Actualiza la página."

const RESTRICCIONES_CREATIVOS: Restricciones = {
  creativos_copy_chk: {
    mensaje: "El copy sugerido admite hasta 2.200 caracteres.",
    campo: "copySugerido",
  },
  creativos_enlace_chk: {
    mensaje:
      "El enlace de destino debe empezar por https:// y tener hasta 2.000 caracteres.",
    campo: "enlaceDestino",
  },
  creativos_hashtags_chk: {
    mensaje: `Puedes agregar hasta ${MAX_HASHTAGS} hashtags.`,
    campo: "hashtags",
  },
  creativos_menciones_chk: {
    mensaje: `Puedes agregar hasta ${MAX_MENCIONES} menciones.`,
    campo: "menciones",
  },
  creativos_pendiente_key: MENSAJES_CREATIVO.pendienteExiste,
  creativos_vigente_key: CAMBIO_SIMULTANEO,
  creativos_oferta_version_key: CAMBIO_SIMULTANEO,
  creativo_archivos_archivo_path_key:
    "Este archivo ya quedó registrado. Actualiza la página para verlo.",
  creativo_archivos_archivo_path_chk:
    "El archivo no quedó guardado en la carpeta de este creativo. Súbelo de nuevo.",
  creativo_archivos_mime_chk:
    "Este tipo de archivo no se admite en un creativo.",
  creativo_archivos_sha256_chk:
    "La huella del archivo no es válida. Súbelo de nuevo.",
  creativo_archivos_orden_chk: "El orden de los archivos no es válido.",
  creativo_archivos_ancho_chk: "Las medidas del archivo no son válidas.",
  creativo_archivos_alto_chk: "Las medidas del archivo no son válidas.",
  creativo_archivos_duracion_chk: "La duración del video no es válida.",
  creativo_archivos_tamano_chk: "El archivo está vacío. Elige otro.",
}

export function interpretarErrorCreativo(error: ErrorBd): ErrorBdInterpretado {
  return interpretarErrorBd(error, RESTRICCIONES_CREATIVOS)
}

/**
 * La ruta ya tiene su fila (`creativo_archivos_archivo_path_key`): una
 * confirmación repetida (reintento o doble clic) que ganó la otra llamada.
 */
export function esRutaYaRegistrada(error: ErrorBd): boolean {
  return (
    error.code === "23505" &&
    `${error.message ?? ""} ${error.details ?? ""}`.includes(
      "creativo_archivos_archivo_path_key"
    )
  )
}

/**
 * Una subida no tiene campos que marcar: se muestra el primer motivo del
 * rechazo («Falta la huella SHA-256 del archivo…») junto al archivo.
 */
export function mensajeValidacion(error: z.ZodError): string {
  return error.issues[0]?.message ?? MENSAJES_CREATIVO.archivoInvalido
}
