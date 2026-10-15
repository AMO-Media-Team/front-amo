/**
 * Textos de presentación de Configuración (módulo puro): nombres de enums,
 * rangos de seguidores y reparto de la comisión.
 */
import { NOMBRES_PLATAFORMA } from "@/features/dashboard/insights/textos"
import { formatearNumero } from "@/lib/format"

import type {
  CanalNotificacion,
  DocumentoMedio,
  Plataforma,
  TipoDocumentoElectronico,
  TipoRetencion,
  TipoTerminos,
} from "./tipos"
import { redondear } from "./valores"

export function nombrePlataforma(plataforma: Plataforma): string {
  return NOMBRES_PLATAFORMA[plataforma]
}

export const NOMBRES_DOCUMENTO_MEDIO: Readonly<Record<DocumentoMedio, string>> =
  {
    CEDULA_FRENTE: "Cédula (frente)",
    CEDULA_REVERSO: "Cédula (reverso)",
    PRUEBA_VIDA: "Prueba de vida",
    RUT: "RUT",
    RUT_SOCIEDAD: "RUT de la sociedad",
    CAMARA_COMERCIO: "Cámara de Comercio",
    CERT_BANCARIA: "Certificación bancaria",
    CERT_BILLETERA: "Certificado de billetera",
    SEG_SOCIAL: "Seguridad social",
  }

export const NOMBRES_RETENCION: Readonly<Record<TipoRetencion, string>> = {
  RETEFUENTE: "Retención en la fuente",
  RETEICA: "ReteICA",
  RETEIVA: "ReteIVA",
}

export const NOMBRES_CONCEPTO: Readonly<Record<string, string>> = {
  SERVICIOS: "Servicios",
  PUBLICIDAD: "Publicidad",
  HONORARIOS: "Honorarios",
}

export const NOMBRES_DOCUMENTO_ELECTRONICO: Readonly<
  Record<TipoDocumentoElectronico, string>
> = {
  FACTURA_VENTA: "Factura de venta",
  DOCUMENTO_SOPORTE: "Documento soporte",
}

export const NOMBRES_TERMINOS: Readonly<
  Record<TipoTerminos, { titulo: string; resumen: string }>
> = {
  TERMINOS_MEDIO: {
    titulo: "Términos para medios",
    resumen: "Lo que acepta un medio al unirse al marketplace.",
  },
  TERMINOS_ANUNCIANTE: {
    titulo: "Términos para anunciantes",
    resumen: "Lo que acepta una empresa al pautar en AMO.",
  },
  POLITICA_DATOS: {
    titulo: "Política de tratamiento de datos",
    resumen: "Autorización de datos personales (Ley 1581 de 2012).",
  },
  CONDICIONES_COMERCIALES: {
    titulo: "Condiciones comerciales",
    resumen: "Comisiones, pagos y condiciones del servicio.",
  },
}

export const NOMBRES_CANAL: Readonly<Record<CanalNotificacion, string>> = {
  APP: "En la aplicación",
  EMAIL: "Correo",
  WHATSAPP: "WhatsApp",
  PUSH: "Notificación push",
}

export const NOMBRES_FORMATO: Readonly<Record<string, string>> = {
  POST_FEED: "Post de feed",
  REEL: "Reel",
  HISTORIA: "Historia",
  CARRUSEL: "Carrusel",
  VIDEO: "Video",
}

/** "30.000 – 60.000 seguidores" · "Más de 120.000 seguidores". */
export function rangoSeguidores(minimo: number, maximo: number | null): string {
  if (maximo === null) return `Desde ${formatearNumero(minimo)} seguidores`
  return `${formatearNumero(minimo)} – ${formatearNumero(maximo)} seguidores`
}

export interface RepartoComision {
  bruto: number
  comision: number
  medio: number
}

/** Cuánto queda para AMO y cuánto para el medio de un monto bruto. */
export function repartoComision(
  bruto: number,
  porcentaje: number
): RepartoComision {
  const comision = redondear(bruto * porcentaje, 0)
  return { bruto, comision, medio: bruto - comision }
}

export function pluralizar(
  cantidad: number,
  singular: string,
  plural: string
): string {
  return `${formatearNumero(cantidad)} ${cantidad === 1 ? singular : plural}`
}
