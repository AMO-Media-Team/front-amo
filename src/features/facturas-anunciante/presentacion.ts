/**
 * Presentación de las facturas para la empresa anunciante (módulo puro): el
 * estado en su voz, el plazo de vencimiento («Vence en 5 días», «Venció hace
 * 12 días»), el CUFE abreviado, los medios de pago y los nombres de los
 * archivos que descarga. Los días se cuentan en el calendario de Bogotá: el
 * servidor entrega `hoy` como 'YYYY-MM-DD' y así el servidor y la hidratación
 * pintan lo mismo.
 */
import type { PresentacionEstado } from "@/features/operacion/estados"
import { formatearNumero } from "@/lib/format"

import type {
  CampanaFactura,
  EsquemaFacturacion,
  EstadoFactura,
  EstadoFacturaVisible,
  MedioPago,
  PlazoFactura,
} from "./tipos"

function estado(
  etiqueta: string,
  tono: PresentacionEstado["tono"],
  descripcion: string
): PresentacionEstado {
  return { etiqueta, tono, descripcion }
}

/** El estado de cada factura dicho para quien la paga. */
export const ESTADOS_FACTURA_ANUNCIANTE: Readonly<
  Record<EstadoFactura, PresentacionEstado>
> = {
  BORRADOR: estado(
    "En preparación",
    "neutro",
    "AMO la está preparando; aún no se ha expedido."
  ),
  EMITIDA: estado("Por pagar", "info", "Expedida; aún no registramos pagos."),
  PAGADA_PARCIAL: estado(
    "Pago parcial",
    "aviso",
    "Registramos parte del pago; queda saldo por pagar."
  ),
  PAGADA: estado("Pagada", "exito", "Sin saldo pendiente."),
  VENCIDA: estado(
    "Vencida",
    "peligro",
    "Pasó su fecha de vencimiento y aún tiene saldo."
  ),
  ANULADA: estado(
    "Anulada",
    "neutro",
    "Anulada con una nota crédito: no tienes que pagarla."
  ),
}

/** Orden de las opciones del filtro: primero lo que pide atención. */
export const ORDEN_ESTADOS_VISIBLES: readonly EstadoFacturaVisible[] = [
  "VENCIDA",
  "EMITIDA",
  "PAGADA_PARCIAL",
  "PAGADA",
  "ANULADA",
]

/** Estados con saldo por cobrar (los únicos que vencen). */
const CON_SALDO: readonly EstadoFactura[] = [
  "EMITIDA",
  "PAGADA_PARCIAL",
  "VENCIDA",
]

export function tieneSaldoPendiente(estadoFactura: EstadoFactura): boolean {
  return CON_SALDO.includes(estadoFactura)
}

interface SituacionFactura {
  estado: EstadoFactura
  fechaVencimiento: string | null
  saldo: number
}

/**
 * Estado que se muestra: una factura con saldo cuyo vencimiento ya pasó es
 * «Vencida» aunque la tarea de cada cuarto de hora aún no la haya marcado
 * (`private.actualizar_lote('facturas_vencidas')` usa la misma regla).
 */
export function estadoVisible(
  factura: SituacionFactura,
  hoy: string
): EstadoFactura {
  const porVencer =
    factura.estado === "EMITIDA" || factura.estado === "PAGADA_PARCIAL"
  return porVencer &&
    factura.saldo > 0 &&
    factura.fechaVencimiento !== null &&
    factura.fechaVencimiento < hoy
    ? "VENCIDA"
    : factura.estado
}

const DIA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/
const MS_DIA = 86_400_000

function diaUtc(dia: string): number | null {
  const partes = DIA_ISO.exec(dia)
  if (!partes) return null
  const [anio, mes, d] = partes.slice(1).map(Number)
  return Date.UTC(anio, mes - 1, d)
}

/** Días de calendario de `desde` a `hasta` ('YYYY-MM-DD'); `null` si alguna no es fecha. */
export function diasEntre(desde: string, hasta: string): number | null {
  const a = diaUtc(desde)
  const b = diaUtc(hasta)
  return a === null || b === null ? null : Math.round((b - a) / MS_DIA)
}

/** A partir de aquí el vencimiento se avisa con el tono de atención. */
const DIAS_AVISO = 5

/**
 * «Vence en 5 días», «Vence hoy», «Venció hace 12 días». Solo para facturas
 * con saldo y fecha de vencimiento: una pagada o anulada no tiene plazo.
 */
export function plazoFactura(
  factura: SituacionFactura,
  hoy: string
): PlazoFactura | null {
  if (
    !tieneSaldoPendiente(factura.estado) ||
    factura.saldo <= 0 ||
    !factura.fechaVencimiento
  ) {
    return null
  }
  const dias = diasEntre(hoy, factura.fechaVencimiento)
  if (dias === null) return null
  if (dias > 1) {
    return {
      texto: `Vence en ${formatearNumero(dias)} días`,
      tono: dias <= DIAS_AVISO ? "aviso" : "neutro",
      dias,
    }
  }
  if (dias === 1) return { texto: "Vence mañana", tono: "aviso", dias }
  if (dias === 0) return { texto: "Vence hoy", tono: "aviso", dias }
  if (dias === -1) return { texto: "Venció ayer", tono: "peligro", dias }
  return {
    texto: `Venció hace ${formatearNumero(-dias)} días`,
    tono: "peligro",
    dias,
  }
}

const INICIO_CUFE = 8
const FIN_CUFE = 6

/** «3fa94c1b…9e02d1»: lo justo para reconocerlo; se copia completo. */
export function abreviarCufe(cufe: string): string {
  const limpio = cufe.trim()
  return limpio.length <= INICIO_CUFE + FIN_CUFE + 1
    ? limpio
    : `${limpio.slice(0, INICIO_CUFE)}…${limpio.slice(-FIN_CUFE)}`
}

export const ETIQUETAS_MEDIO_PAGO: Readonly<Record<MedioPago, string>> = {
  TRANSFERENCIA: "Transferencia",
  PSE: "PSE",
  CONSIGNACION: "Consignación",
  CHEQUE: "Cheque",
  OTRO: "Otro medio",
}

export function etiquetaMedioPago(medio: string): string {
  return medio in ETIQUETAS_MEDIO_PAGO
    ? ETIQUETAS_MEDIO_PAGO[medio as MedioPago]
    : medio
}

export const ESQUEMAS_FACTURACION: Readonly<
  Record<EsquemaFacturacion, { etiqueta: string; descripcion: string }>
> = {
  COMPRA_REVENTA: {
    etiqueta: "Servicio de pauta",
    descripcion:
      "AMO te factura la pauta completa y el IVA se calcula sobre el total.",
  },
  MANDATO: {
    etiqueta: "Mandato",
    descripcion:
      "AMO factura su comisión con IVA y recibe el valor de los medios como ingreso para terceros, sin IVA.",
  },
}

export function esquemaDe(valor: string): EsquemaFacturacion {
  return valor === "MANDATO" ? "MANDATO" : "COMPRA_REVENTA"
}

/** «Campaña Vacaciones 2026», «Consolidada» o, archivada, «Campaña archivada». */
export function describirCobertura(campana: CampanaFactura | null): string {
  if (!campana) return "Consolidada"
  return campana.nombre ?? "Campaña archivada"
}

/** Extensión del objeto de Storage ("pdf" si no se reconoce). */
export function extensionDe(ruta: string): string {
  const coincidencia = /\.([a-z0-9]{2,5})$/i.exec(ruta)
  return coincidencia ? coincidencia[1].toLowerCase() : "pdf"
}

/** Nombre legible del archivo descargado (sin tildes: lo limpia `nombreDescarga`). */
export function nombreArchivoFactura(
  archivo:
    | { tipo: "factura"; numero: string }
    | { tipo: "pago"; numero: string; fecha: string }
    | { tipo: "nota_credito"; numero: string },
  extension: string
): string {
  switch (archivo.tipo) {
    case "factura":
      return `Factura ${archivo.numero}.${extension}`
    case "pago":
      return `Soporte de pago ${archivo.numero} ${archivo.fecha}.${extension}`
    case "nota_credito":
      return `Nota credito ${archivo.numero}.${extension}`
  }
}
