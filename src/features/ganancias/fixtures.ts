/**
 * Datos de prueba de «Ganancias» (solo pruebas): filas como las devuelven las
 * RPC del medio y sus DTO. Montos del caso de la suite `humo_e3_finanzas`.
 */
import type { FilaLiquidacionRpc } from "./datos"
import type { LiquidacionMedio, ResumenGanancias } from "./tipos"

export const ID_LIQUIDACION = "0199f3a0-0000-7000-8000-0000000005a1"
export const ID_LIQUIDACION_ANTERIOR = "0199f3a0-0000-7000-8000-0000000005a0"
export const ID_DOCUMENTO = "0199f3a0-0000-7000-8000-0000000005d1"

/** Una pagada con documento soporte, como la entrega `mis_liquidaciones_medio`. */
export function filaLiquidacion(
  cambios: Partial<Record<keyof FilaLiquidacionRpc, unknown>> = {}
): FilaLiquidacionRpc {
  return {
    id: ID_LIQUIDACION,
    periodo_inicio: "2026-10-01",
    periodo_fin: "2026-10-15",
    estado: "PAGADA",
    cantidad_asignaciones: 2,
    monto_bruto: 10_000_000,
    monto_comision: 2_000_000,
    monto_medio: 8_000_000,
    retefuente: 480_000,
    reteica: 77_280,
    reteiva: 0,
    monto_retenciones: 557_280,
    monto_neto: 7_442_720,
    created_at: "2026-10-16T15:00:00+00:00",
    aprobada_at: "2026-10-17T15:00:00+00:00",
    enviada_banco_at: "2026-10-20T14:00:00+00:00",
    fecha_pago: "2026-10-21",
    fecha_pago_estimada: null as unknown as string,
    referencia_pago: "TRF-20261021-1",
    soporte_pago_path: `liquidacion/${ID_LIQUIDACION}/pago/s.pdf`,
    requiere_documento_soporte: true,
    documento_id: ID_DOCUMENTO,
    documento_numero: "DSF2",
    documento_fecha: "2026-10-17",
    documento_estado: "EMITIDO",
    cuds: null as unknown as string,
    documento_path: `documento_soporte/${ID_DOCUMENTO}/d.pdf`,
    numero_factura_medio: null as unknown as string,
    factura_medio_path: null as unknown as string,
    alerta_seg_social: false,
    bloquea_seg_social: false,
    ...cambios,
  } as FilaLiquidacionRpc
}

/** DTO de una liquidación pagada con documento soporte. */
export function liquidacion(
  cambios: Partial<LiquidacionMedio> = {}
): LiquidacionMedio {
  return {
    id: ID_LIQUIDACION,
    periodoInicio: "2026-10-01",
    periodoFin: "2026-10-15",
    estado: "PAGADA",
    cantidadAsignaciones: 2,
    montoBruto: 10_000_000,
    montoComision: 2_000_000,
    montoMedio: 8_000_000,
    retefuente: 480_000,
    reteica: 77_280,
    reteiva: 0,
    montoRetenciones: 557_280,
    montoNeto: 7_442_720,
    creadaAt: "2026-10-16T15:00:00+00:00",
    aprobadaAt: "2026-10-17T15:00:00+00:00",
    enviadaBancoAt: "2026-10-20T14:00:00+00:00",
    fechaPago: "2026-10-21",
    fechaPagoEstimada: null,
    referenciaPago: "TRF-20261021-1",
    conSoportePago: true,
    requiereDocumentoSoporte: true,
    documento: {
      numero: "DSF2",
      fecha: "2026-10-17",
      estado: "EMITIDO",
      cuds: null,
      conArchivo: true,
    },
    factura: { numero: null, conArchivo: false },
    alertaSegSocial: false,
    bloqueaSegSocial: false,
    ...cambios,
  }
}

/** La de un medio que factura, aprobada y sin factura aún. */
export function liquidacionPorFacturar(
  cambios: Partial<LiquidacionMedio> = {}
): LiquidacionMedio {
  return liquidacion({
    estado: "APROBADA",
    enviadaBancoAt: null,
    fechaPago: null,
    fechaPagoEstimada: "2026-10-23",
    referenciaPago: null,
    conSoportePago: false,
    requiereDocumentoSoporte: false,
    documento: null,
    factura: { numero: null, conArchivo: false },
    ...cambios,
  })
}

export const RESUMEN: ResumenGanancias = {
  ganadoMes: 2_631_520,
  porLiquidar: 1_707_440,
  asignacionesPorLiquidar: 3,
  porPagar: 878_190,
  liquidacionesPorPagar: 1,
  pagadoHistorico: 26_565_356,
  retencionesHistoricas: 1_377_516,
  proximoPagoEstimado: "2026-10-23",
  periodicidad: "QUINCENAL",
  diasPago: 8,
  comisionVisible: true,
  requiereDocumentoSoporte: true,
  segSocialPendiente: false,
}
