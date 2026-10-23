/**
 * Catálogo de los documentos de la empresa anunciante (ANU-001, ADM-003;
 * módulo puro): cómo se llama cada uno, qué se espera, consejos para que lo
 * aprueben a la primera y cuáles exige la verificación según el país. Fuente
 * única de estos textos en «Mi empresa › Documentos» y en el expediente de
 * verificación del equipo AMO.
 */
import { BUCKETS } from "@/lib/archivos/buckets"
import { MIB } from "@/lib/archivos/formato"
import { esMimeConocido, extensionDeMime } from "@/lib/archivos/mime"
import type { ReglasArchivo } from "@/lib/archivos/validar"
import type { Database } from "@/types/database.types"

export type TipoDocumentoAnunciante =
  Database["public"]["Enums"]["documento_anunciante_tipo"]

export interface FichaDocumentoAnunciante {
  titulo: string
  /** Qué es y qué debe verse (una o dos frases). */
  descripcion: string
  /** Lo que más rechazos evita, en orden de importancia. */
  consejos: readonly string[]
  /** Cómo se nombra en una frase («el RUT», «la Cámara de Comercio»). */
  enFrase: string
}

export const PAIS_COLOMBIA = "CO"

/** Orden en que se listan: los de existencia y tributarios primero. */
export const ORDEN_DOCUMENTOS_ANUNCIANTE: readonly TipoDocumentoAnunciante[] = [
  "RUT",
  "CAMARA_COMERCIO",
  "OTRO",
  "CERT_BANCARIA",
]

const CONSEJO_PDF =
  "Si lo tienes en PDF, súbelo así: se lee mejor que una foto."

export const FICHAS_DOCUMENTO_ANUNCIANTE: Readonly<
  Record<TipoDocumentoAnunciante, FichaDocumentoAnunciante>
> = {
  RUT: {
    titulo: "RUT",
    descripcion:
      "El Registro Único Tributario de la empresa, actualizado. Lo descargas en PDF desde el portal de la DIAN.",
    consejos: [
      CONSEJO_PDF,
      "El NIT y la razón social deben coincidir con los datos de tu empresa en AMO.",
      "Debe estar actualizado: descárgalo de nuevo si cambiaste de dirección o de actividad.",
    ],
    enFrase: "el RUT",
  },
  CAMARA_COMERCIO: {
    titulo: "Cámara de Comercio",
    descripcion:
      "El certificado de existencia y representación legal de la empresa, expedido hace menos de 30 días.",
    consejos: [
      CONSEJO_PDF,
      "Sube el certificado completo, con todas sus páginas.",
      "Que tenga menos de 30 días de expedido: lo pides en línea a la cámara de comercio de tu ciudad.",
    ],
    enFrase: "la Cámara de Comercio",
  },
  CERT_BANCARIA: {
    titulo: "Certificado bancario",
    descripcion:
      "La certificación de la cuenta bancaria de la empresa, expedida por su banco.",
    consejos: [
      CONSEJO_PDF,
      "La cuenta debe estar a nombre de la empresa, con la misma razón social.",
    ],
    enFrase: "el certificado bancario",
  },
  OTRO: {
    titulo: "Otro documento",
    descripcion:
      "Un documento adicional que respalde a la empresa, por ejemplo el registro mercantil de su país.",
    consejos: [
      CONSEJO_PDF,
      "Si está en otro idioma, puedes incluir una traducción simple en el mismo archivo.",
    ],
    enFrase: "otro documento",
  },
}

/**
 * Fuera de Colombia no hay Cámara de Comercio: se pide el documento
 * equivalente de su país (se guarda con el mismo tipo).
 */
const CAMARA_EXTERIOR: FichaDocumentoAnunciante = {
  titulo: "Certificado de existencia",
  descripcion:
    "El documento oficial de tu país que acredita que la empresa existe y quién la representa (el equivalente a la Cámara de Comercio).",
  consejos: [
    CONSEJO_PDF,
    "Que sea reciente y se lean el nombre de la empresa y su número de registro.",
    "Si está en otro idioma, puedes incluir una traducción simple en el mismo archivo.",
  ],
  enFrase: "el certificado de existencia",
}

/** Ficha que ve la empresa según su país. */
export function fichaDocumento(
  tipo: TipoDocumentoAnunciante,
  pais: string
): FichaDocumentoAnunciante {
  return tipo === "CAMARA_COMERCIO" && pais !== PAIS_COLOMBIA
    ? CAMARA_EXTERIOR
    : FICHAS_DOCUMENTO_ANUNCIANTE[tipo]
}

/**
 * Lo que exige la verificación (igual que `private.validar_verificacion_anunciante`
 * y `enviar_anunciante_a_verificacion_srv`): en Colombia, RUT y Cámara de
 * Comercio; en el exterior, uno de Cámara (su equivalente) u «Otro».
 */
export function documentosExigidos(pais: string): {
  todos: readonly TipoDocumentoAnunciante[]
  alguno: readonly TipoDocumentoAnunciante[]
} {
  return pais === PAIS_COLOMBIA
    ? { todos: ["RUT", "CAMARA_COMERCIO"], alguno: [] }
    : { todos: [], alguno: ["CAMARA_COMERCIO", "OTRO"] }
}

/**
 * Los que se pueden cargar sin que la verificación los exija. El RUT es
 * colombiano: a una empresa del exterior no se le ofrece (si ya lo cargó, la
 * lista lo muestra igual entre los opcionales).
 */
export function documentosOpcionales(
  pais: string
): readonly TipoDocumentoAnunciante[] {
  return pais === PAIS_COLOMBIA ? ["CERT_BANCARIA", "OTRO"] : ["CERT_BANCARIA"]
}

/**
 * Lo que admite el bucket privado `documentos`: PDF o foto (JPG, PNG, WebP,
 * HEIC) de hasta 10 MB. Se comprueba sobre el archivo final, ya comprimido.
 */
export const REGLAS_DOCUMENTO_ANUNCIANTE: ReglasArchivo = {
  mimes: BUCKETS.documentos.mimes,
  maxBytes: BUCKETS.documentos.maxBytes,
}

/**
 * Al elegir, una foto del celular puede pesar más de 10 MB: se reduce en el
 * dispositivo antes de subirla, así que la zona de carga solo descarta lo
 * desmesurado y el límite real se aplica después de comprimir.
 */
export const REGLAS_SELECCION_ANUNCIANTE: ReglasArchivo = {
  mimes: BUCKETS.documentos.mimes,
  maxBytes: 40 * MIB,
}

export const AYUDA_FORMATOS =
  "PDF o foto (JPG, PNG, WebP o HEIC) de hasta 10 MB. Las fotos se reducen solas antes de subir."

/**
 * Nombre con que se muestra y se descarga un documento cargado: el título del
 * tipo con la extensión de su formato («Cámara de Comercio.pdf»).
 */
export function nombreArchivoDocumento(
  tipo: TipoDocumentoAnunciante,
  formato: string | null,
  pais: string = PAIS_COLOMBIA
): string {
  const titulo = fichaDocumento(tipo, pais).titulo
  return formato && esMimeConocido(formato)
    ? `${titulo}.${extensionDeMime(formato)}`
    : titulo
}
