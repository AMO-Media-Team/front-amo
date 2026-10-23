/**
 * Textos de la verificación de anunciantes (módulo puro): nombres de los
 * documentos, qué comprobar en cada uno frente a los datos registrados de la
 * empresa y los motivos frecuentes de cada decisión (se pueden editar: los
 * recibe la empresa tal cual).
 */
import {
  FICHAS_DOCUMENTO_ANUNCIANTE,
  type TipoDocumentoAnunciante,
} from "@/features/documentos-anunciante/catalogo"
import type { Tono } from "@/features/operacion/estados"
import { cerrarFrase } from "@/features/operacion/formato"
import { SITUACIONES_REQUISITO } from "@/features/verificacion/presentacion"
import { formatearFecha } from "@/lib/format"

import type { Exigencia, SituacionRequisitoAnunciante } from "./requisitos"

export function tituloDocumento(tipo: TipoDocumentoAnunciante): string {
  return FICHAS_DOCUMENTO_ANUNCIANTE[tipo].titulo
}

/** Siglas («RUT») y nombres propios («Cámara de Comercio») no van en minúscula. */
const INICIO_PROPIO = /^(?:[A-ZÁÉÍÓÚÑ]{2,}(?![a-záéíóúñ])|Cámara\b)/

/**
 * Nombre del documento dentro de una frase: «Revisar RUT», «Revisar Cámara de
 * Comercio», «Revisar certificado bancario».
 */
export function enFraseDocumento(tipo: TipoDocumentoAnunciante): string {
  const titulo = tituloDocumento(tipo)
  return INICIO_PROPIO.test(titulo)
    ? titulo
    : titulo.charAt(0).toLocaleLowerCase("es-CO") + titulo.slice(1)
}

/** Etiqueta y tono de cada situación de un requisito del anunciante. */
export const SITUACIONES_REQUISITO_ANUNCIANTE: Readonly<
  Record<SituacionRequisitoAnunciante, { etiqueta: string; tono: Tono }>
> = {
  ...SITUACIONES_REQUISITO,
  desactualizado: { etiqueta: "Desactualizado", tono: "aviso" },
}

/**
 * Aviso del expediente cuando la identificación de la empresa cambió (el
 * `cambioAt`) después de aprobar `cantidad` documentos exigidos: la BD no deja
 * verificarla hasta que se carguen y aprueben de nuevo.
 */
export function avisoIdentificacionCambiada(
  cambioAt: string,
  cantidad: number
): string {
  const uno = cantidad === 1
  return `La identificación de la empresa (NIT, país o razón social) cambió el ${formatearFecha(cambioAt, "largo")}, después de aprobar ${uno ? "uno de los documentos exigidos" : `${cantidad} de los documentos exigidos`}: ${uno ? "debe" : "deben"} cargarse y aprobarse de nuevo. ${uno ? "Está marcado" : "Están marcados"} como «Desactualizado».`
}

export const ETIQUETAS_EXIGENCIA: Readonly<Record<Exigencia, string | null>> = {
  obligatorio: null,
  alguno: "Basta uno de los dos",
  adicional: "Adicional",
}

export interface DatosComparables {
  razonSocial: string
  /** NIT con DV («900.123.456-7») o identificación tributaria extranjera. */
  identificacion: string | null
  /** El país de la empresa es Colombia (NIT) o no (identificación tributaria). */
  colombiana: boolean
}

/**
 * Qué comprobar en un documento antes de aprobarlo, con los datos que la
 * empresa registró para compararlos a simple vista.
 */
export function guiaDocumento(
  tipo: TipoDocumentoAnunciante,
  { razonSocial, identificacion, colombiana }: DatosComparables
): string[] {
  const nombreId = colombiana ? "NIT" : "identificación tributaria"
  // «Café S.A.S.» ya cierra la frase: sin punto doble.
  const aNombre = cerrarFrase(`Está a nombre de ${razonSocial}`)
  const coincideId = identificacion
    ? `El ${nombreId} coincide con el registrado: ${identificacion}.`
    : `Tiene el ${nombreId} de la empresa (aún no lo registra en su ficha).`
  switch (tipo) {
    case "RUT":
      return [
        aNombre,
        coincideId,
        "Se lee completo y es una versión reciente, descargada de la DIAN.",
      ]
    case "CAMARA_COMERCIO":
      return [
        cerrarFrase(
          `Es el certificado de existencia y representación legal de ${razonSocial}`
        ),
        "Fue expedido hace menos de 30 días.",
        coincideId,
      ]
    case "CERT_BANCARIA":
      return [
        cerrarFrase(`La cuenta está a nombre de ${razonSocial}`),
        "Lo expidió el banco en los últimos 30 días.",
      ]
    case "OTRO":
      return [
        "Acredita la existencia de la empresa en su país (registro mercantil o equivalente).",
        aNombre,
        coincideId,
      ]
  }
}

/** Campo del motivo cuando se ofrecen motivos frecuentes. */
export const PLACEHOLDER_MOTIVO =
  "Elige un motivo frecuente o escríbelo con tus palabras."

/** Al rechazar un documento: la empresa lo recibe para cargarlo de nuevo. */
export const MOTIVOS_RECHAZO_DOCUMENTO: readonly string[] = [
  "El documento no se lee bien. Carga el PDF original o una foto nítida, sin reflejos.",
  "La Cámara de Comercio tiene más de 30 días. Carga un certificado expedido este mes.",
  "El NIT del documento no coincide con el registrado. Revísalo y carga el correcto.",
  "El documento no está a nombre de la empresa registrada.",
  "Falta una parte del documento. Cárgalo completo, con todas sus páginas.",
]

/** Al rechazar la verificación de la empresa: corrige y la reenvía. */
export const MOTIVOS_RECHAZO_EMPRESA: readonly string[] = [
  "El RUT está ilegible. Carga el PDF descargado de la DIAN y vuelve a enviar la empresa.",
  "La Cámara de Comercio tiene más de 30 días. Carga un certificado reciente y vuelve a enviar la empresa.",
  "El NIT no coincide con el RUT. Corrige el NIT en «Mi empresa» o carga el RUT correcto.",
  "La razón social no coincide con los documentos. Corrígela y vuelve a enviar la empresa.",
]

export const MOTIVOS_SUSPENSION: readonly string[] = [
  "Incumplió los términos y condiciones de la plataforma.",
  "Tiene facturas vencidas sin pagar.",
  "Sus documentos vencieron y no los ha renovado.",
  "La empresa pidió suspender su cuenta.",
]

export const MOTIVOS_REACTIVACION: readonly string[] = [
  "Se resolvió el motivo de la suspensión.",
  "Pagó las facturas pendientes.",
  "Renovó sus documentos y los aprobamos.",
]
