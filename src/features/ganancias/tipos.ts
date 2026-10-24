/**
 * DTO de «Ganancias» del medio (MED-015): solo lo que la interfaz necesita.
 * El medio ya no lee las tablas `liquidaciones` ni `documentos_soporte` (D82):
 * todo llega de sus RPC (`resumen_ganancias_medio`, `mis_liquidaciones_medio`,
 * `lineas_liquidacion_medio`). Las rutas de Storage se quedan en el servidor:
 * al navegador solo llega si hay archivo.
 */
import type { Database } from "@/types/database.types"

type Enums = Database["public"]["Enums"]

export type EstadoLiquidacion = Enums["liquidacion_estado"]
export type EstadoDocumentoSoporte = Enums["documento_soporte_estado"]
export type Plataforma = Enums["plataforma"]

/** Lo que resume `resumen_ganancias_medio`. */
export interface ResumenGanancias {
  /** Valor para el medio de lo verificado este mes (antes de retenciones). */
  ganadoMes: number
  /** Verificado sin liquidar: estimado antes de retenciones. */
  porLiquidar: number
  asignacionesPorLiquidar: number
  /** Neto de las liquidaciones en revisión o aprobadas. */
  porPagar: number
  liquidacionesPorPagar: number
  /** Neto recibido en las liquidaciones pagadas. */
  pagadoHistorico: number
  retencionesHistoricas: number
  /** 'YYYY-MM-DD' (cierre del periodo + días de pago) de la más próxima. */
  proximoPagoEstimado: string | null
  /** `liquidaciones.periodicidad`: SEMANAL, QUINCENAL o MENSUAL. */
  periodicidad: string | null
  diasPago: number | null
  /** `comision.visible_para_medio`: si no, bruto y comisión no llegan. */
  comisionVisible: boolean
  /** El medio no factura: sus pagos llevan documento soporte. */
  requiereDocumentoSoporte: boolean
  segSocialPendiente: boolean
  /** Con la política BLOQUEAR, sin la planilla no se aprueba ni se paga. */
  segSocialBloquea: boolean
}

/** Documento soporte vigente (no anulado) de una liquidación. */
export interface DocumentoSoporteMedio {
  numero: string | null
  /** 'YYYY-MM-DD'. */
  fecha: string | null
  estado: EstadoDocumentoSoporte | null
  cuds: string | null
  /** Hay PDF para descargar. */
  conArchivo: boolean
}

/** Factura del medio que factura (D83). */
export interface FacturaMedio {
  numero: string | null
  conArchivo: boolean
}

/**
 * Una liquidación del medio (`mis_liquidaciones_medio`). La anulada no sale en
 * la lista: solo llega pedida por su `id` (el aviso de anulación lleva a ella).
 */
export interface LiquidacionMedio {
  id: string
  /** 'YYYY-MM-DD'. */
  periodoInicio: string
  periodoFin: string
  estado: EstadoLiquidacion
  cantidadAsignaciones: number
  /** `null` si la comisión no es visible para el medio. */
  montoBruto: number | null
  montoComision: number | null
  /** Lo que gana el medio antes de retenciones. */
  montoMedio: number
  retefuente: number
  reteica: number
  reteiva: number
  montoRetenciones: number
  montoNeto: number
  creadaAt: string
  aprobadaAt: string | null
  /** Fecha del archivo de pagos que la incluyó (D80): «En proceso de pago». */
  enviadaBancoAt: string | null
  /** 'YYYY-MM-DD'. */
  fechaPago: string | null
  /** 'YYYY-MM-DD': cierre del periodo + días de pago, mientras no se paga. */
  fechaPagoEstimada: string | null
  referenciaPago: string | null
  conSoportePago: boolean
  requiereDocumentoSoporte: boolean
  documento: DocumentoSoporteMedio | null
  factura: FacturaMedio
  alertaSegSocial: boolean
  /** Con la política BLOQUEAR, la alerta impide aprobarla. */
  bloqueaSegSocial: boolean
}

/** Una página de pagos (cursor por `id`, del más reciente al más antiguo). */
export interface PaginaLiquidaciones {
  liquidaciones: LiquidacionMedio[]
  /** `id` desde el que se pide la siguiente página, o `null` si no hay más. */
  siguiente: string | null
}

/** Una retención practicada sobre una publicación (`retenciones_aplicadas`). */
export interface RetencionAplicada {
  tipo: string
  concepto: string | null
  /** Fracción: 0,04 = 4 %; 0,00966 = 9,66 ‰. */
  tarifa: number
  base: number
  valor: number
  municipioCodigo: string | null
}

/** Retenciones de la liquidación agrupadas por tipo, concepto, tarifa y municipio. */
export interface RetencionAgrupada {
  clave: string
  tipo: string
  concepto: string | null
  tarifa: number
  base: number
  valor: number
  municipioCodigo: string | null
  /** Nombre del municipio (ReteICA), si se conoce. */
  municipio: string | null
}

/** Una publicación incluida en la liquidación (`lineas_liquidacion_medio`). */
export interface LineaLiquidacionMedio {
  asignacionId: string
  oferta: string
  marca: string | null
  anunciante: string | null
  plataforma: Plataforma
  formato: string | null
  publicadaAt: string | null
  verificadaAt: string | null
  montoBruto: number | null
  montoComision: number | null
  montoMedio: number
  retenciones: RetencionAplicada[]
  montoRetenciones: number
  montoNeto: number
}

/** Verificada sin liquidar: entra en la próxima liquidación. */
export interface AsignacionPorLiquidar {
  id: string
  oferta: string
  marca: string | null
  plataforma: Plataforma
  formato: string | null
  verificadaAt: string | null
  /** Valor para el medio, antes de retenciones. */
  montoMedio: number | null
}

/** Lo que decide las retenciones y si el medio factura (`medios_privado` propio). */
export interface CondicionTributaria {
  esDeclarante: boolean
  obligadoFacturar: boolean
  responsableIva: boolean
}

/** Archivos que el medio puede descargar de una liquidación. */
export type ArchivoLiquidacion =
  "soporte_pago" | "documento_soporte" | "factura"
