/**
 * Errores de los pagos a medios en voz del equipo de Finanzas (módulo puro).
 * La BD explica casi todo en el `detail` de sus `AMO_*` (con el rótulo
 * «Documento soporte requerido: …» que exige LIQ-006); aquí se da texto o
 * acción propia a los `hint` de la fase y se decide en qué campo del
 * formulario de pago va cada error.
 */
import { type ErrorBd, interpretarErrorBd } from "@/lib/errores-bd"
import { formatearNumero } from "@/lib/format"

export const HINTS_PAGOS = {
  /** Alguna ya está en otro archivo: se ofrece «Incluirlas otra vez». */
  yaDispersada: "ya_dispersada",
  datosSensibles: "datos_sensibles.ver",
  datosPagoIncompletos: "datos_pago_incompletos",
  documentoRequerido: "documento_soporte_requerido",
  noAprobada: "no_aprobada",
  archivoNoCargado: "archivo_no_cargado",
  fechaPago: "fecha_pago",
  soporteNoCargado: "soporte_no_cargado",
} as const

export const MENSAJES_PAGOS = {
  sinDatosSensibles:
    "Necesitas el permiso Ver datos sensibles: el archivo revela los datos bancarios de cada medio.",
  noAprobada:
    "Alguna liquidación ya no está aprobada (se pagó o se anuló mientras tanto). La lista ya muestra lo vigente.",
  archivoNoCargado:
    "No pudimos guardar el archivo de pagos. Genéralo de nuevo.",
  soporteAjeno:
    "El soporte no corresponde a esta liquidación. Súbelo de nuevo.",
  soporteNoCargado: "El soporte del pago no está cargado: súbelo de nuevo.",
  documentoRequerido:
    "Documento soporte requerido: falta el documento soporte o la factura del medio para registrar el pago.",
  sinArchivo: "Este archivo de pagos ya no existe o no tienes acceso a él.",
  fueraDelArchivo:
    "Alguna liquidación ya no está en este archivo de pagos (se incluyó en otro). La página ya muestra lo vigente.",
  noAprobadaUna: "Ya no está aprobada (se pagó o se anuló mientras tanto).",
  soporteNoCopiado:
    "No pudimos copiar el comprobante a esta liquidación. Inténtalo de nuevo.",
} as const

/** «No pudimos leer los datos de pago de Radio Pasto y La Voz…». */
export function mensajeDatosIlegibles(medios: readonly string[]): string {
  const visibles = medios.slice(0, 5)
  const resto = medios.length - visibles.length
  const nombres =
    resto > 0
      ? [...visibles, `${formatearNumero(resto)} más`]
      : visibles.length > 0
        ? visibles
        : ["un medio"]
  const lista =
    nombres.length > 1
      ? `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`
      : nombres[0]
  const sujeto = medios.length === 1 ? "ese medio" : "esos medios"
  return `No pudimos leer los datos de pago de ${lista}. Pide que los vuelvan a guardar en Mi medio › Pago; mientras tanto, genera el archivo sin ${sujeto}.`
}

/** Campo del formulario de pago donde se muestra un error. */
export type CampoPago = "fecha" | "referencia" | "soporte"

export interface ErrorPagos {
  mensaje: string
  campo?: CampoPago
  hint: string | null
  /** Regla de negocio: no hace falta registrarlo como fallo del sistema. */
  esperado: boolean
}

export function interpretarErrorPagos(error: ErrorBd): ErrorPagos {
  const base = interpretarErrorBd(error)
  const hint = error.hint ?? null
  switch (hint) {
    case HINTS_PAGOS.datosSensibles:
      return { mensaje: MENSAJES_PAGOS.sinDatosSensibles, hint, esperado: true }
    case HINTS_PAGOS.noAprobada:
      return { mensaje: MENSAJES_PAGOS.noAprobada, hint, esperado: true }
    case HINTS_PAGOS.archivoNoCargado:
      return { mensaje: MENSAJES_PAGOS.archivoNoCargado, hint, esperado: true }
    case HINTS_PAGOS.fechaPago:
      return { mensaje: base.mensaje, campo: "fecha", hint, esperado: true }
    case HINTS_PAGOS.soporteNoCargado:
      return {
        mensaje: MENSAJES_PAGOS.soporteNoCargado,
        campo: "soporte",
        hint,
        esperado: true,
      }
    default:
      return { mensaje: base.mensaje, hint, esperado: base.esperado }
  }
}

/** ¿El error dice que lo que se ve ya cambió (pagada, anulada, en otro archivo)? */
export function cambioDeEstado(error: ErrorBd): boolean {
  return (
    error.hint === HINTS_PAGOS.noAprobada ||
    error.hint === HINTS_PAGOS.yaDispersada ||
    (error.message?.startsWith("AMO_TRANSICION_INVALIDA") ?? false)
  )
}
