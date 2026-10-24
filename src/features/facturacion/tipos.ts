/**
 * Tipos de la facturación al anunciante y la cartera (LIQ-008, ADM-004):
 * lo que leen las consultas y reciben los componentes. Las cifras llegan ya
 * como `number` (pesos con centavos) y las fechas de calendario como
 * `YYYY-MM-DD`.
 */
import type { FacturacionEmpresa } from "@/features/empresa/tipos"
import type { TramoCartera } from "@/features/operacion/calculos"
import type { Database } from "@/types/database.types"

type Enums = Database["public"]["Enums"]

export type EstadoFactura = Enums["factura_estado"]
export type EstadoAsignacion = Enums["asignacion_estado"]
export type Plataforma = Enums["plataforma"]

/** `facturacion.esquema`: base del IVA de la factura (D16 y D37 del RF). */
export const ESQUEMAS_FACTURACION = ["COMPRA_REVENTA", "MANDATO"] as const
export type EsquemaFacturacion = (typeof ESQUEMAS_FACTURACION)[number]

/** `pagos_anunciante.medio_pago` (restricción `pagos_anunciante_medio_chk`). */
export const MEDIOS_PAGO = [
  "TRANSFERENCIA",
  "PSE",
  "CONSIGNACION",
  "CHEQUE",
  "OTRO",
] as const
export type MedioPago = (typeof MEDIOS_PAGO)[number]

/** Una fila del listado de facturas (`type`: RowData de la tabla). */
export type FacturaFila = {
  id: string
  /** `prefijo + consecutivo`; `null` en un borrador. */
  numero: string | null
  estado: EstadoFactura
  anuncianteId: string
  /** Nombre comercial; `null` si el rol no ve al anunciante. */
  anunciante: string | null
  razonSocial: string | null
  campanaId: string | null
  /** `null` = consolidada (todas sus campañas). */
  campana: string | null
  fechaEmision: string | null
  fechaVencimiento: string | null
  periodoDesde: string | null
  periodoHasta: string | null
  total: number
  saldo: number
  creadaAt: string
  esDemo: boolean
}

export interface AnuncianteFactura {
  id: string
  nombreComercial: string
  razonSocial: string
  nit: string | null
  digitoVerificacion: string | null
  identificacionExtranjera: string | null
  paisIso2: string
  municipioCodigo: string | null
  /** `datos_facturacion` tal como está guardado (va al archivo de carga). */
  datosFacturacion: Record<string, unknown>
  facturacion: FacturacionEmpresa
}

export interface ResolucionDeFactura {
  numero: string
  prefijo: string
  rangoDesde: number
  rangoHasta: number
}

export interface FichaFactura {
  id: string
  numero: string | null
  prefijo: string | null
  consecutivo: number | null
  estado: EstadoFactura
  esquema: EsquemaFacturacion
  /** Fracción (0,19); `null` en facturas anteriores a la fase 5. */
  porcentajeIva: number | null
  periodoDesde: string | null
  periodoHasta: string | null
  fechaEmision: string | null
  fechaVencimiento: string | null
  subtotal: number
  iva: number
  /** Ingreso para terceros (mandato): el valor de los medios. */
  valorTerceros: number
  total: number
  pagado: number
  valorNotasCredito: number
  saldo: number
  cufe: string | null
  tieneArchivo: boolean
  emitidaAt: string | null
  pagadaAt: string | null
  vencidaAt: string | null
  anuladaAt: string | null
  creadaAt: string
  esDemo: boolean
  anuncianteId: string
  /** `null` si el rol no ve al anunciante (RLS). */
  anunciante: AnuncianteFactura | null
  campana: { id: string; nombre: string } | null
  /** `null` si el rol no ve las resoluciones (`configuracion.ver`). */
  resolucion: ResolucionDeFactura | null
}

/** Una asignación incluida en la factura (concepto). */
export interface LineaFactura {
  asignacionId: string
  estado: EstadoAsignacion
  campanaId: string
  campana: string | null
  medioId: string
  medio: string | null
  plataforma: Plataforma
  oferta: string | null
  montoBruto: number
  /** Desglose (`asignacion_montos`): `null` si el rol no lo ve. */
  montoComision: number | null
  montoMedio: number | null
  verificadaAt: string | null
}

export interface PagoFactura {
  id: string
  fechaPago: string
  monto: number
  /** Retenciones que practicó el anunciante: cuentan para el saldo. */
  retenciones: number
  medioPago: string
  referencia: string | null
  tieneSoporte: boolean
  registradoAt: string
}

export interface NotaCreditoFactura {
  id: string
  numero: string
  cude: string
  fechaEmision: string
  valor: number
  anulaFactura: boolean
  motivo: string
  registradaAt: string
}

/** `pendientes_facturacion`: lo verificado sin facturar, por anunciante y campaña. */
export interface PendienteFacturacion {
  anuncianteId: string
  anunciante: string
  campanaId: string
  campana: string
  asignaciones: number
  montoBruto: number
  primeraVerificada: string
  ultimaVerificada: string
}

/** Lo por facturar de un anunciante, con sus campañas. */
export interface GrupoPorFacturar {
  anuncianteId: string
  anunciante: string
  asignaciones: number
  montoBruto: number
  /** Día (Bogotá) de la primera verificación sin facturar. */
  primeraVerificada: string
  campanas: readonly PendienteFacturacion[]
}

/** Resolución FACTURA_VENTA activa: sugiere el prefijo y el número siguiente. */
export interface ResolucionActiva {
  numero: string
  prefijo: string
  rangoDesde: number
  rangoHasta: number
  consecutivoActual: number
  vigenteDesde: string
  vigenteHasta: string | null
}

export interface ResumenFacturas {
  /** Bruto verificado sin facturar (`pendientes_facturacion`). */
  porFacturar: number
  asignacionesPorFacturar: number
  anunciantesPorFacturar: number
  borradores: number
  /** Saldo de las expedidas (emitidas, con pago parcial y vencidas). */
  saldoPorCobrar: number
  saldoVencido: number
  facturasVencidas: number
}

/** Una fila de `reporte_cartera` con sus tramos de edad. */
export interface FilaCartera {
  anuncianteId: string
  anunciante: string
  facturado: number
  pagado: number
  saldo: number
  porTramo: Readonly<Record<TramoCartera, number>>
  facturasVencidas: number
}

/** Factura con saldo vencido a la fecha de corte. */
export interface FacturaVencida {
  id: string
  numero: string | null
  anuncianteId: string
  anunciante: string | null
  fechaVencimiento: string
  diasMora: number
  saldo: number
}
