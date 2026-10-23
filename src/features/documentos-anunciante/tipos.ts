/**
 * Contratos de «Mi empresa › Documentos» (ANU-001): lo que el servidor lee
 * para la empresa y entrega a la interfaz. Nunca viaja la ruta del archivo en
 * Storage: el visor la firma en el servidor a partir del id de la fila.
 */
import type { Database } from "@/types/database.types"

import type { TipoDocumentoAnunciante } from "./catalogo"

export type { TipoDocumentoAnunciante } from "./catalogo"

type Enums = Database["public"]["Enums"]

export type EstadoDocumento = Enums["documento_estado"]
export type EstadoAnunciante = Enums["anunciante_estado"]

export interface DocumentoAnunciante {
  id: string
  tipo: TipoDocumentoAnunciante
  estado: EstadoDocumento
  /** Observaciones de la revisión (motivo del rechazo o notas al aprobar). */
  observaciones: string | null
  /** Vigencia que fijó quien lo aprobó (`YYYY-MM-DD`). */
  venceEl: string | null
  /** Instante de la carga (ISO). */
  cargadoAt: string
  revisadoAt: string | null
  /** MIME deducido de la extensión del objeto. */
  formato: string | null
}

/** Lo de la empresa que decide qué se exige y qué sigue. */
export interface EmpresaDocumentos {
  id: string
  nombre: string
  /** ISO 3166-1 alfa-2: Colombia exige RUT y Cámara; el exterior, su equivalente. */
  pais: string
  estado: EstadoAnunciante
  enviadoVerificacionAt: string | null
  /**
   * Último cambio de la identificación (NIT, DV, país, identificación
   * extranjera o razón social) antes de verificarla: lo aprobado antes ya no
   * la respalda y debe cargarse de nuevo.
   */
  identificacionCambiadaAt: string | null
}

export interface DatosDocumentosAnunciante {
  empresa: EmpresaDocumentos
  /** Todas las cargas de la empresa, de la más reciente a la más antigua. */
  documentos: DocumentoAnunciante[]
  /** Día de hoy en Bogotá (`YYYY-MM-DD`), fijado por el servidor. */
  hoy: string
}
