/**
 * STUB DEL LÍDER (fase 2): contrato del paquete EM, que lo completa (textos,
 * consejos) conservando los nombres. VA lo usa en el expediente.
 */
import type { Database } from "@/types/database.types"

export type TipoDocumentoAnunciante =
  Database["public"]["Enums"]["documento_anunciante_tipo"]

export interface FichaDocumentoAnunciante {
  titulo: string
  descripcion: string
}

export const FICHAS_DOCUMENTO_ANUNCIANTE: Readonly<
  Record<TipoDocumentoAnunciante, FichaDocumentoAnunciante>
> = {
  RUT: {
    titulo: "RUT",
    descripcion: "Registro Único Tributario de la empresa.",
  },
  CAMARA_COMERCIO: {
    titulo: "Cámara de Comercio",
    descripcion: "Certificado de existencia y representación legal.",
  },
  CERT_BANCARIA: {
    titulo: "Certificado bancario",
    descripcion: "Certificación de la cuenta de la empresa.",
  },
  OTRO: { titulo: "Otro documento", descripcion: "Documento adicional." },
}

/**
 * Lo que exige la verificación (igual que `private.validar_verificacion_anunciante`):
 * en Colombia, RUT y Cámara de Comercio; en el exterior, uno de Cámara u «Otro».
 */
export function documentosExigidos(pais: string): {
  todos: readonly TipoDocumentoAnunciante[]
  alguno: readonly TipoDocumentoAnunciante[]
} {
  return pais === "CO"
    ? { todos: ["RUT", "CAMARA_COMERCIO"], alguno: [] }
    : { todos: [], alguno: ["CAMARA_COMERCIO", "OTRO"] }
}
