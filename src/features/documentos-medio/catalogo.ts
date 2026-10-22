/**
 * Catálogo de los nueve documentos del medio (MED-003, módulo puro): cómo se
 * llama cada uno para la persona, qué se espera, consejos para que lo aprueben
 * a la primera y qué cámara ofrecer en el celular. Fuente única de estos
 * textos en «Mis documentos».
 */
import { BUCKETS } from "@/lib/archivos/buckets"
import { MIB } from "@/lib/archivos/formato"
import { esMimeConocido, extensionDeMime } from "@/lib/archivos/mime"
import type { ReglasArchivo } from "@/lib/archivos/validar"

import type { TipoDocumentoMedio } from "./tipos"

export type GrupoDocumento = "identidad" | "tributario" | "pago" | "aportes"

export interface FichaDocumento {
  titulo: string
  /** Qué es y qué debe verse (una o dos frases). */
  descripcion: string
  /** Lo que más rechazos evita, en orden de importancia. */
  consejos: readonly string[]
  grupo: GrupoDocumento
  /** Cámara del celular: trasera para documentos, frontal para la selfie. */
  camara: "environment" | "user"
  /** Dato biométrico (Ley 1581, art. 5): su entrega es facultativa. */
  biometrico: boolean
}

/** Orden en que se listan: identidad, tributarios, pago y aportes. */
export const ORDEN_DOCUMENTOS: readonly TipoDocumentoMedio[] = [
  "CEDULA_FRENTE",
  "CEDULA_REVERSO",
  "PRUEBA_VIDA",
  "RUT",
  "RUT_SOCIEDAD",
  "CAMARA_COMERCIO",
  "CERT_BANCARIA",
  "CERT_BILLETERA",
  "SEG_SOCIAL",
]

const CONSEJOS_FOTO_DOCUMENTO = [
  "Apóyalo sobre una superficie lisa y oscura, con buena luz.",
  "Que se vean las cuatro esquinas y se lean todos los datos.",
  "Sin reflejos del flash ni dedos encima del texto.",
] as const

const CONSEJO_PDF =
  "Si lo tienes en PDF, súbelo así: se lee mejor que una foto."

export const FICHAS_DOCUMENTO: Readonly<
  Record<TipoDocumentoMedio, FichaDocumento>
> = {
  CEDULA_FRENTE: {
    titulo: "Documento de identidad (frente)",
    descripcion:
      "La cara de tu cédula (o del documento con que te registraste) donde aparecen tu foto, tu nombre y el número.",
    consejos: CONSEJOS_FOTO_DOCUMENTO,
    grupo: "identidad",
    camara: "environment",
    biometrico: false,
  },
  CEDULA_REVERSO: {
    titulo: "Documento de identidad (reverso)",
    descripcion:
      "La otra cara del mismo documento, con la fecha y el lugar de expedición.",
    consejos: CONSEJOS_FOTO_DOCUMENTO,
    grupo: "identidad",
    camara: "environment",
    biometrico: false,
  },
  PRUEBA_VIDA: {
    titulo: "Prueba de vida",
    descripcion:
      "Una selfie en la que sostienes tu documento de identidad junto a tu cara. Confirma que quien se registra es el titular.",
    consejos: [
      "Mira de frente a la cámara, sin gafas oscuras, gorra ni tapabocas.",
      "Sostén el documento cerca de tu cara, sin tapar tu foto ni tus datos.",
      "Busca buena luz, idealmente de frente.",
    ],
    grupo: "identidad",
    camara: "user",
    biometrico: true,
  },
  RUT: {
    titulo: "RUT",
    descripcion:
      "Tu Registro Único Tributario actualizado, a tu nombre. Lo descargas en PDF desde el portal de la DIAN.",
    consejos: [
      CONSEJO_PDF,
      "Debe estar actualizado: descárgalo de nuevo si cambiaste de dirección o de actividad.",
    ],
    grupo: "tributario",
    camara: "environment",
    biometrico: false,
  },
  RUT_SOCIEDAD: {
    titulo: "RUT de la empresa",
    descripcion:
      "El RUT de la sociedad que es dueña del medio, actualizado y descargado de la DIAN.",
    consejos: [
      CONSEJO_PDF,
      "El NIT debe coincidir con el que registraste en tus datos de pago.",
    ],
    grupo: "tributario",
    camara: "environment",
    biometrico: false,
  },
  CAMARA_COMERCIO: {
    titulo: "Certificado de Cámara de Comercio",
    descripcion:
      "El certificado de existencia y representación legal de la empresa, expedido recientemente.",
    consejos: [
      CONSEJO_PDF,
      "Sube el certificado completo, con todas sus páginas.",
    ],
    grupo: "tributario",
    camara: "environment",
    biometrico: false,
  },
  CERT_BANCARIA: {
    titulo: "Certificación bancaria",
    descripcion:
      "El certificado que expide tu banco con el titular, el tipo y el número de la cuenta donde recibirás los pagos.",
    consejos: [
      CONSEJO_PDF,
      "La cuenta debe estar a tu nombre, el mismo que registraste en tus datos de pago.",
    ],
    grupo: "pago",
    camara: "environment",
    biometrico: false,
  },
  CERT_BILLETERA: {
    titulo: "Certificado de billetera digital",
    descripcion:
      "El certificado o una captura de tu billetera digital (por ejemplo, Nequi o Daviplata) donde se vean el titular y el número asociado.",
    consejos: [
      "La billetera debe estar a tu nombre, el mismo que registraste en tus datos de pago.",
      "Si es una captura, que se lean el nombre del titular y el número completo.",
    ],
    grupo: "pago",
    camara: "environment",
    biometrico: false,
  },
  SEG_SOCIAL: {
    titulo: "Seguridad social",
    descripcion:
      "La planilla de pago de tus aportes como trabajador independiente (PILA) del último mes.",
    consejos: [
      CONSEJO_PDF,
      "Solo se exige si en un mes tus pagos superan el monto que fija AMO; tenerla al día evita demoras en tus liquidaciones.",
    ],
    grupo: "aportes",
    camara: "environment",
    biometrico: false,
  },
}

/**
 * Documento voluntario: su entrega es facultativa (dato biométrico) y el
 * equipo AMO puede reemplazarlo por una videollamada. Se pide, pero no
 * frena el envío a verificación ni se presenta como pendiente.
 */
export function esVoluntario(tipo: TipoDocumentoMedio): boolean {
  return FICHAS_DOCUMENTO[tipo].biometrico
}

/**
 * Lo que admite el bucket privado `documentos`: PDF o foto (JPG, PNG, WebP,
 * HEIC) de hasta 10 MB. Se comprueba sobre el archivo final, ya comprimido.
 */
export const REGLAS_DOCUMENTO: ReglasArchivo = {
  mimes: BUCKETS.documentos.mimes,
  maxBytes: BUCKETS.documentos.maxBytes,
}

/**
 * Al elegir, una foto del celular puede pesar más de 10 MB: se reduce en el
 * dispositivo antes de subirla, así que la zona de carga solo descarta lo
 * desmesurado y el límite real se aplica después de comprimir.
 */
export const REGLAS_SELECCION: ReglasArchivo = {
  mimes: BUCKETS.documentos.mimes,
  maxBytes: 40 * MIB,
}

export const AYUDA_FORMATOS =
  "Foto (JPG, PNG, WebP o HEIC) o PDF de hasta 10 MB. Las fotos se reducen solas antes de subir."

/**
 * Nombre con que se muestra y se descarga un documento cargado: el título del
 * tipo con la extensión de su formato («Certificación bancaria.pdf»).
 */
export function nombreArchivoDocumento(
  tipo: TipoDocumentoMedio,
  formato: string | null
): string {
  const titulo = FICHAS_DOCUMENTO[tipo].titulo
  return formato && esMimeConocido(formato)
    ? `${titulo}.${extensionDeMime(formato)}`
    : titulo
}
