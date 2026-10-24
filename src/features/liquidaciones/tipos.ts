/**
 * Tipos de las liquidaciones de Finanzas (LIQ-001, LIQ-002, LIQ-003, LIQ-007).
 * Las filas de las tablas se declaran con `type` (TanStack exige que sean
 * asignables a `Record<string, unknown>`). Ninguna ruta de Storage viaja al
 * navegador: la interfaz solo sabe si el archivo existe.
 */
import type { EstadoDocumentoSoporte } from "@/features/documento-soporte/tipos"
import type {
  EstadoLiquidacion,
  Plataforma,
} from "@/features/operacion/estados"

export type { EstadoDocumentoSoporte, EstadoLiquidacion }

/** Quién numera el documento del pago: el medio no factura (documento soporte) o sí (factura del medio). */
export type SoportePago = "DOCUMENTO_SOPORTE" | "FACTURA"

/** Avisos de un medio con verificadas por liquidar. */
export type AlertaPendiente = "DATOS_PAGO" | "SEG_SOCIAL"

/** Un medio con asignaciones verificadas sin liquidar (`pendientes_liquidacion`). */
export type FilaPendiente = {
  medioId: string
  medio: string
  municipio: string | null
  asignaciones: number
  /** Valor del medio antes de retenciones. */
  montoMedio: number
  primeraVerificada: string
  ultimaVerificada: string
  /** Fin del último periodo liquidado (no anulado), `AAAA-MM-DD`. */
  ultimaLiquidacionFin: string | null
  requiereDocumentoSoporte: boolean
  datosPagoListos: boolean
  segSocialPendiente: boolean
}

/** Lo que el diálogo del corte necesita de cada medio pendiente. */
export type MedioCorte = Pick<
  FilaPendiente,
  "medioId" | "primeraVerificada" | "ultimaLiquidacionFin"
>

export interface DocumentoResumen {
  id: string
  estado: EstadoDocumentoSoporte
  numero: string | null
  /** Ya se transmitió a la DIAN (tiene CUDS). */
  conCuds: boolean
  conNotaAjuste: boolean
}

export interface DispersionResumen {
  id: string
  /** Fecha del archivo de pagos; `null` si el rol no puede leer las dispersiones. */
  fecha: string | null
}

/** Una liquidación en las vistas por estado. */
export type FilaLiquidacion = {
  id: string
  estado: EstadoLiquidacion
  medioId: string
  /** `null` si el rol no puede leer los medios. */
  medio: string | null
  periodoInicio: string
  periodoFin: string
  asignaciones: number
  montoMedio: number
  montoRetenciones: number
  montoNeto: number
  requiereDocumentoSoporte: boolean
  alertaSegSocial: boolean
  /** La generó quien mira (D17: no puede aprobarla salvo SUPERADMIN). */
  generadaPorMi: boolean
  creadaAt: string
  aprobadaAt: string | null
  anuladaAt: string | null
  /** `AAAA-MM-DD`. */
  fechaPago: string | null
  /** El documento soporte vigente (o el último, si todos se anularon). */
  documento: DocumentoResumen | null
  numeroFacturaMedio: string | null
  dispersion: DispersionResumen | null
  esDemo: boolean
}

/** Retención aplicada a una asignación (`asignacion_montos.retenciones_aplicadas`). */
export interface RetencionAplicada {
  tipo: string
  concepto: string | null
  tarifa: number
  /** Base de la asignación (prorrateo). */
  base: number
  /** Base de toda la liquidación (sobre la que se evaluó la cuantía mínima). */
  basePago: number
  valor: number
  municipioCodigo: string | null
}

/** Una retención de la liquidación: la suma de su prorrateo por asignación. */
export interface RetencionLiquidacion {
  clave: string
  tipo: string
  concepto: string | null
  tarifa: number
  base: number
  valor: number
  municipioCodigo: string | null
  /** Nombre del municipio (ReteICA), resuelto en el servidor. */
  municipio: string | null
}

export interface LineaLiquidacion {
  asignacionId: string
  oferta: string | null
  campana: string | null
  marca: string | null
  plataforma: Plataforma
  verificadaAt: string | null
  montoBruto: number
  montoComision: number
  montoMedio: number
  montoRetenciones: number
  montoNeto: number
}

/** `tributario.politica_seg_social`: alertar o bloquear la aprobación. */
export type PoliticaSegSocial = "ALERTA" | "BLOQUEAR"

/** Ficha de una liquidación. */
export interface LiquidacionFicha extends FilaLiquidacion {
  municipio: string | null
  montoBruto: number
  montoComision: number
  pagadaAt: string | null
  referenciaPago: string | null
  tieneSoportePago: boolean
  tieneFacturaMedio: boolean
  retenciones: RetencionLiquidacion[]
  lineas: LineaLiquidacion[]
}

/** Resultado por medio del corte de un periodo. */
export interface ResultadoCorteMedio {
  medioId: string
  medio: string
  liquidacionId: string | null
  /** Texto listo para mostrar si ese medio no se liquidó. */
  error: string | null
}

/** Resultado por liquidación de una aprobación en lote. */
export interface ResultadoAprobacion {
  liquidacionId: string
  ok: boolean
  /** Por qué no se aprobó (D17, seguridad social, estado). */
  error: string | null
}

/** Archivos de la liquidación que el equipo descarga (firma como servicio). */
export type ArchivoLiquidacion = "soporte_pago" | "factura_medio"
