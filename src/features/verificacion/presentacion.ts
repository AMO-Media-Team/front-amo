/**
 * Textos de la verificación (módulo puro): nombres de los requisitos, tono de
 * cada situación y el detalle de la BD traducido a la interfaz. La BD lista
 * los documentos que faltan con su código (`CEDULA_FRENTE, PRUEBA_VIDA…`);
 * aquí se cambian por su nombre legible antes de mostrarlo.
 */
import { TIPOS_DOCUMENTO_MEDIO, type Tono } from "@/features/operacion/estados"

import {
  CLAVE_CERTIFICADO_PAGO,
  type Requisito,
  type SituacionRequisito,
  type TipoDocumentoMedio,
} from "./requisitos"

export const NOMBRE_CERTIFICADO_PAGO = "Certificado del medio de pago"

export function tituloRequisito(clave: Requisito["clave"]): string {
  return clave === CLAVE_CERTIFICADO_PAGO
    ? NOMBRE_CERTIFICADO_PAGO
    : TIPOS_DOCUMENTO_MEDIO[clave]
}

export const SITUACIONES_REQUISITO: Readonly<
  Record<SituacionRequisito, { etiqueta: string; tono: Tono }>
> = {
  aprobado: { etiqueta: "Aprobado", tono: "exito" },
  por_revisar: { etiqueta: "Por revisar", tono: "aviso" },
  rechazado: { etiqueta: "Rechazado", tono: "peligro" },
  vencido: { etiqueta: "Vencido", tono: "peligro" },
  falta: { etiqueta: "Sin cargar", tono: "neutro" },
}

const CODIGOS_DOCUMENTO = new RegExp(
  `\\b(${Object.keys(TIPOS_DOCUMENTO_MEDIO).join("|")})\\b`,
  "g"
)

/**
 * Cambia los códigos de documento del `detail` de la BD por su nombre:
 * «Faltan documentos aprobados y vigentes: CEDULA_FRENTE, RUT.» →
 * «Faltan documentos aprobados y vigentes: Cédula (frente), RUT.».
 */
export function humanizarDetalle(texto: string): string {
  return texto.replace(
    CODIGOS_DOCUMENTO,
    (codigo) =>
      TIPOS_DOCUMENTO_MEDIO[codigo as keyof typeof TIPOS_DOCUMENTO_MEDIO] ??
      codigo
  )
}

/**
 * Un nombre del catálogo dentro de una frase: «Cédula (frente)» → «cédula
 * (frente)», «Integración (API)» → «integración (API)»; las siglas que lo
 * abren se conservan («RUT de la sociedad»).
 */
export function enFrase(nombre: string): string {
  const primera = nombre.split(/\s/, 1)[0] ?? ""
  const esSigla =
    primera.length > 1 &&
    /\p{Lu}/u.test(primera) &&
    primera === primera.toLocaleUpperCase("es-CO")
  return esSigla
    ? nombre
    : nombre.charAt(0).toLocaleLowerCase("es-CO") + nombre.slice(1)
}

/** «Nivel 2 · Persona natural con RUT». */
export function etiquetaNivelCompleta(nivel: number, nombre: string): string {
  return `Nivel ${nivel} · ${nombre}`
}

/** Qué comprobar en cada documento antes de aprobarlo. */
export const GUIA_DOCUMENTO: Readonly<
  Record<TipoDocumentoMedio, readonly string[]>
> = {
  CEDULA_FRENTE: [
    "Se leen el nombre, el número y la foto.",
    "No tiene recortes, reflejos ni señales de edición.",
  ],
  CEDULA_REVERSO: [
    "Se leen la fecha y el lugar de expedición.",
    "Corresponde a la misma cédula del frente.",
  ],
  PRUEBA_VIDA: [
    "La persona sostiene la cédula junto a su rostro.",
    "El rostro coincide con la foto de la cédula.",
  ],
  RUT: [
    "Está a nombre del titular y es reciente.",
    "El número coincide con el documento de identidad.",
  ],
  RUT_SOCIEDAD: [
    "Está a nombre de la sociedad y es reciente.",
    "El NIT coincide con el de la Cámara de Comercio.",
  ],
  CAMARA_COMERCIO: [
    "Certificado vigente de existencia y representación legal.",
    "El representante legal es quien cargó la cédula.",
  ],
  CERT_BANCARIA: [
    "La cuenta está a nombre del titular registrado.",
    "Los últimos dígitos coinciden con los datos de pago.",
  ],
  CERT_BILLETERA: [
    "La billetera está a nombre del titular registrado.",
    "El número coincide con los datos de pago.",
  ],
  SEG_SOCIAL: [
    "Planilla del periodo vigente a nombre del titular.",
    "Muestra el pago de salud y pensión.",
  ],
}

/** Motivos frecuentes: un toque llena el campo (se pueden editar). */
export const MOTIVOS_RECHAZO_DOCUMENTO: readonly string[] = [
  "La imagen no se lee bien. Toma una foto nítida, con buena luz y sin reflejos.",
  "El documento está vencido. Carga uno vigente.",
  "El documento no está a nombre del titular registrado.",
  "Falta una parte del documento. Cárgalo completo.",
]

export const MOTIVOS_RECHAZO_CUENTA: readonly string[] = [
  "La captura no muestra el código temporal completo.",
  "La captura no muestra la fecha ni la cifra de seguidores.",
  "La cuenta de la captura no coincide con la registrada.",
  "La cifra de seguidores no coincide con la captura.",
]

export const MOTIVOS_CAMBIO_NIVEL: readonly string[] = [
  "Cargó los documentos del nivel nuevo y los aprobamos.",
  "Uno de los documentos de su nivel venció y no lo ha renovado.",
  "Cambió su forma jurídica (persona natural o sociedad).",
]

/** Orden en que se listan los tipos de documento (el del catálogo). */
export const ORDEN_TIPOS_DOCUMENTO = Object.keys(
  TIPOS_DOCUMENTO_MEDIO
) as TipoDocumentoMedio[]

export const MOTIVOS_RECHAZO_MEDIO: readonly string[] = [
  "Los documentos no corresponden al titular de la cuenta.",
  "No pudimos comprobar el control de la cuenta social.",
  "La cuenta no cumple el mínimo de seguidores verificados.",
]
