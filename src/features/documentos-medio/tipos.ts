/**
 * Contratos de «Mis documentos» (MED-003): lo que el servidor lee para el
 * medio y entrega a la interfaz. Nunca viaja la ruta del archivo en Storage:
 * el visor la firma en el servidor a partir del id de la fila.
 */
import type { Database } from "@/types/database.types"

type Enums = Database["public"]["Enums"]

export type TipoDocumentoMedio = Enums["documento_medio_tipo"]
export type EstadoDocumento = Enums["documento_estado"]
export type EstadoMedio = Enums["medio_estado"]
export type MetodoPago = Enums["metodo_pago"]
export type TipoDocumentoIdentidad = Enums["documento_identidad_tipo"]

/** `ARCHIVO` lo carga el medio; `VIDEOLLAMADA` lo registra el equipo AMO (prueba de vida sin imagen). */
export type MetodoDocumento = "ARCHIVO" | "VIDEOLLAMADA"

export type NivelVerificacion = 1 | 2 | 3

export interface DocumentoCargado {
  id: string
  tipo: TipoDocumentoMedio
  estado: EstadoDocumento
  metodo: MetodoDocumento
  /** Observaciones de la revisión (motivo del rechazo o notas al aprobar). */
  observaciones: string | null
  /** Vigencia que fijó quien lo aprobó (`YYYY-MM-DD`). */
  venceEl: string | null
  /** Instante de la carga (ISO). */
  cargadoAt: string
  revisadoAt: string | null
  /** MIME deducido de la extensión del objeto; `null` en una videollamada. */
  formato: string | null
}

/** Una fila de `niveles_verificacion`. */
export interface RequisitosNivel {
  nivel: NivelVerificacion
  nombre: string
  /** Requisitos en lenguaje de la persona («RUT actualizado»). */
  requisitos: string[]
  documentos: TipoDocumentoMedio[]
}

/** Lo de `medios_privado` que decide qué se exige (sin datos cifrados). */
export interface PerfilTributario {
  metodoPago: MetodoPago | null
  /** Último cambio de método o de cuenta: el certificado debe ser posterior. */
  datosPagoCambiadosAt: string | null
  tipoDocumento: TipoDocumentoIdentidad | null
  esDeclarante: boolean
  obligadoFacturar: boolean
  responsableIva: boolean
}

export interface MedioDocumentos {
  id: string
  nombre: string
  estado: EstadoMedio
  /** 0 mientras no esté verificado. */
  nivel: number
  enviadoVerificacionAt: string | null
}

export interface DatosDocumentosMedio {
  medio: MedioDocumentos
  perfil: PerfilTributario
  niveles: RequisitosNivel[]
  /** Todas las cargas del medio, de la más reciente a la más antigua. */
  documentos: DocumentoCargado[]
  /** Día de hoy en Bogotá (`YYYY-MM-DD`), fijado por el servidor. */
  hoy: string
}
