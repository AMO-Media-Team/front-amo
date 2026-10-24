/**
 * Tipos de las facturas del anunciante (ANU-013). El anunciante solo ve sus
 * facturas EXPEDIDAS (la RLS oculta los borradores), sus pagos y sus notas
 * crédito; los conceptos son las asignaciones de su empresa que la factura
 * cubre. Las fechas de calendario llegan como 'YYYY-MM-DD' (hora de Bogotá).
 */
import type { Tono } from "@/features/operacion/estados"
import type { Database } from "@/types/database.types"

type Enums = Database["public"]["Enums"]

export type EstadoFactura = Enums["factura_estado"]
export type Plataforma = Enums["plataforma"]
export type EstadoAsignacion = Enums["asignacion_estado"]

/** Lo que la empresa puede ver: nunca un borrador. */
export type EstadoFacturaVisible = Exclude<EstadoFactura, "BORRADOR">

/** `facturacion.esquema` congelado en la factura (D86). */
export type EsquemaFacturacion = "COMPRA_REVENTA" | "MANDATO"

/** `pagos_anunciante.medio_pago`. */
export type MedioPago =
  "TRANSFERENCIA" | "PSE" | "CONSIGNACION" | "CHEQUE" | "OTRO"

/** Cuánto falta para el vencimiento o cuánto hace que venció. */
export interface PlazoFactura {
  texto: string
  tono: Tono
  /** Días hasta el vencimiento (negativo si ya venció). */
  dias: number
}

/** Campaña de la factura; `null` = consolidada (cubre varias). */
export interface CampanaFactura {
  id: string
  /** `null` si la campaña se archivó después de facturarse. */
  nombre: string | null
}

/** Fila del listado (`type`, no `interface`: TanStack exige un `Record`). */
export type FacturaFila = {
  id: string
  numero: string
  /** Estado para mostrar: con saldo y vencimiento pasado ya es «Vencida». */
  estado: EstadoFactura
  fechaEmision: string
  fechaVencimiento: string | null
  plazo: PlazoFactura | null
  total: number
  saldo: number
  cufe: string | null
  tienePdf: boolean
  campana: CampanaFactura | null
  esDemo: boolean
}

/** Lo que entra al resumen «Por pagar»: facturas con saldo. */
export interface FacturaConSaldo {
  id: string
  numero: string
  estado: EstadoFactura
  fechaVencimiento: string | null
  saldo: number
}

export interface ProximoVencimiento {
  id: string
  numero: string
  fechaVencimiento: string
  saldo: number
  plazo: PlazoFactura
  /** Otras facturas que vencen el mismo día. */
  otrasElMismoDia: number
}

export interface ResumenFacturas {
  porPagar: number
  facturasPorPagar: number
  vencido: number
  facturasVencidas: number
  proximo: ProximoVencimiento | null
}

export interface FacturaDetalle {
  id: string
  numero: string
  estado: EstadoFactura
  fechaEmision: string
  fechaVencimiento: string | null
  plazo: PlazoFactura | null
  periodoDesde: string | null
  periodoHasta: string | null
  esquema: EsquemaFacturacion
  /** Fracción (0,19); `null` en facturas anteriores al esquema configurable. */
  porcentajeIva: number | null
  subtotal: number
  iva: number
  /** Ingreso recibido para terceros (mandato): lo que corresponde a los medios. */
  valorTerceros: number
  total: number
  /** Pagos más las retenciones que practicó la empresa. */
  pagado: number
  valorNotasCredito: number
  saldo: number
  cufe: string | null
  tienePdf: boolean
  campana: CampanaFactura | null
  /** Instantes ISO de los cambios de estado. */
  pagadaAt: string | null
  anuladaAt: string | null
  esDemo: boolean
}

export interface PagoFactura {
  id: string
  fecha: string
  monto: number
  retenciones: number
  medioPago: MedioPago
  referencia: string | null
  tieneSoporte: boolean
}

export interface NotaCreditoFactura {
  id: string
  numero: string
  fechaEmision: string
  valor: number
  motivo: string
  anulaFactura: boolean
}

export interface ConceptoFactura {
  /** Asignación facturada. */
  id: string
  campanaId: string
  campana: string | null
  medioId: string
  medio: string | null
  plataforma: Plataforma
  formato: string | null
  oferta: string | null
  /** Instante ISO en que AMO verificó la publicación. */
  verificadaAt: string | null
  valor: number
  estado: EstadoAsignacion
}

export interface GrupoConceptos {
  campanaId: string
  campana: string | null
  total: number
  conceptos: ConceptoFactura[]
}

/** Opción del filtro por campaña. */
export interface OpcionCampana {
  id: string
  nombre: string
}

/** Archivos que la empresa descarga desde la factura. */
export type TipoArchivoFactura = "factura" | "pago" | "nota_credito"
