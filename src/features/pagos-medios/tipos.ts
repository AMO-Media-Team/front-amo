/**
 * Tipos de los pagos a medios (LIQ-005, LIQ-006). Las filas de las tablas se
 * declaran con `type` (TanStack exige que sean asignables a `Record`). Nada
 * de esto lleva datos reservados del medio: los datos bancarios solo existen,
 * descifrados, dentro del archivo de pagos que arma el servidor.
 */
import type { Database } from "@/types/database.types"

type Enums = Database["public"]["Enums"]

export type MetodoPago = Enums["metodo_pago"]
export type EstadoLiquidacion = Enums["liquidacion_estado"]

/** Una liquidación aprobada de «Por pagar» (`liquidaciones_por_pagar`). */
export type LiquidacionPorPagar = {
  id: string
  medioId: string
  medio: string
  periodoInicio: string
  periodoFin: string
  cantidadAsignaciones: number
  montoNeto: number
  /** Generación de la liquidación: el pago no puede ser anterior a ese día. */
  creadaAt: string
  aprobadaAt: string | null
  /** El medio no factura: su pago lleva documento soporte. */
  requiereDocumentoSoporte: boolean
  /** Documento soporte emitido o factura del medio registrada. */
  documentoListo: boolean
  /** Datos de pago completos con su certificación aprobada después del último cambio. */
  datosPagoListos: boolean
  metodoPago: MetodoPago | null
  /** Último archivo de pagos que la incluyó. */
  dispersionId: string | null
  dispersadaAt: string | null
}

/** Por qué una liquidación no puede ir en el archivo (el primer requisito que falta). */
export type MotivoExclusion = "sin_documento" | "sin_datos_pago"

/** Lo que verá el diálogo «Generar archivo de pagos» antes de llamar al servidor. */
export interface PedidoArchivo {
  /** Las que irán en el archivo (como mucho las que admite un archivo: 500). */
  ids: string[]
  total: number
  medios: number
  /** Elegidas que no pueden ir (se dejan por fuera y se dice por qué). */
  excluidas: { id: string; medio: string; motivo: MotivoExclusion }[]
  /** Incluidas que ya están en otro archivo: piden confirmar «Incluirlas otra vez». */
  yaEnArchivo: { id: string; medio: string; dispersadaAt: string | null }[]
  /** Había más de las que caben en un archivo: van las primeras. */
  recortado: boolean
}

/** Cuántas hay en cada situación (toda la lista, sin filtros). */
export interface ResumenPorPagar {
  total: number
  /** Listas para un archivo nuevo: documento y datos de pago listos, aún sin archivo. */
  listas: number
  montoListas: number
  /** Lo que lleva «Generar con todas las listas» (las primeras que caben en un archivo). */
  archivoListas: PedidoArchivo
  sinDocumento: number
  sinDatosPago: number
  enArchivo: number
}

export interface PaginaPorPagar {
  filas: LiquidacionPorPagar[]
  /** Filas que cumplen la búsqueda y los filtros (todas las páginas). */
  total: number
  resumen: ResumenPorPagar
}

/** Un archivo de pagos generado (historial de dispersiones). */
export type DispersionFila = {
  id: string
  creadaAt: string
  cantidad: number
  montoTotal: number
  /** Nombre de quien lo generó; `null` si la persona no puede ver los perfiles del equipo. */
  generadaPor: string | null
  esDemo: boolean
}

export interface PaginaDispersiones {
  filas: DispersionFila[]
  total: number
}

/** Una liquidación incluida (hoy) en un archivo de pagos. */
export type LiquidacionDeDispersion = {
  id: string
  medio: string
  periodoInicio: string
  periodoFin: string
  montoNeto: number
  estado: EstadoLiquidacion
  fechaPago: string | null
  referenciaPago: string | null
  documentoListo: boolean
  /** Día mínimo del pago (`AAAA-MM-DD`): el de su generación. */
  fechaMinimaPago: string
}

export interface DetalleDispersion {
  dispersion: DispersionFila
  /** Las que hoy apuntan a este archivo (una incluida otra vez pasa al archivo nuevo). */
  liquidaciones: LiquidacionDeDispersion[]
}

export interface PaginaLiquidacionesDispersion {
  filas: LiquidacionDeDispersion[]
  total: number
}

/**
 * Resultado de «Generar archivo de pagos». `ya_dispersada`: alguna ya está en
 * otro archivo y la persona debe confirmar que el banco no la pagó antes de
 * incluirla otra vez (se repite con `repetir: true`).
 */
export type ResultadoArchivoPagos =
  | {
      tipo: "generado"
      dispersionId: string
      cantidad: number
      medios: number
      total: number
      nombreArchivo: string
      /** URL firmada de descarga; `null` si no se pudo firmar (se descarga desde el historial). */
      url: string | null
      avisoDescarga: string | null
    }
  | { tipo: "ya_dispersada"; mensaje: string }

/** El soporte del pago ya está en Storage (ruta comprobada por el servidor). */
export interface SoporteCargado {
  ruta: string
}

export interface PagoRegistrado {
  liquidacionId: string
}

/** Resultado del pago de un archivo con un solo comprobante (cada liquidación por separado). */
export interface PagosArchivoRegistrados {
  registradas: { id: string; medio: string }[]
  fallidas: { id: string; medio: string; mensaje: string }[]
}
