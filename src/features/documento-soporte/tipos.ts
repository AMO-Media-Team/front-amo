/**
 * Tipos del documento soporte (LIQ-004; contrato de la fase 5 entre el paquete DS, que los
 * implementa, y la ficha de la liquidación, que los consume). Módulo puro.
 */
import type { Database } from "@/types/database.types"

export type EstadoDocumentoSoporte =
  Database["public"]["Enums"]["documento_soporte_estado"]

/** `tributario.numeracion_documento_soporte`: quién numera (un rango se usa en un solo sistema). */
export type NumeracionDocumentoSoporte = "PLATAFORMA" | "PROVEEDOR"

export interface NotaAjusteDocumento {
  numero: string
  cude: string | null
  archivoPath: string
  registradaAt: string
}

/** El documento vigente (no anulado) de una liquidación, o el último si todos están anulados. */
export interface DocumentoSoporteFicha {
  id: string
  estado: EstadoDocumentoSoporte
  numero: string | null
  fechaEmision: string | null
  valorTotal: number
  cuds: string | null
  cudsRegistradoAt: string | null
  /** PDF (generado por la plataforma o el del proveedor). */
  archivoPath: string | null
  /** Archivo genérico para el proveedor tecnológico (JSON). */
  archivoProveedorPath: string | null
  notaAjuste: NotaAjusteDocumento | null
  /** Documentos anulados de la misma liquidación (correcciones con nota de ajuste), del más reciente al más antiguo. */
  anteriores: {
    id: string
    numero: string | null
    anuladoAt: string | null
    notaAjusteNumero: string | null
  }[]
}
