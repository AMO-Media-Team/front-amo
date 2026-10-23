/**
 * Filas de la BD → datos de la interfaz (módulo puro). La ruta del archivo en
 * Storage solo sirve para deducir su MIME: nunca sale hacia el navegador.
 */
import { mimeDeArchivo } from "@/lib/archivos/mime"
import type { Database } from "@/types/database.types"

import type { DocumentoExpediente } from "./tipos"

export type FilaDocumento = Pick<
  Database["public"]["Tables"]["documentos_anunciante"]["Row"],
  | "id"
  | "tipo"
  | "estado_validacion"
  | "fecha_vencimiento"
  | "observaciones"
  | "validado_at"
  | "created_at"
  | "archivo_path"
>

export const COLUMNAS_DOCUMENTO =
  "id, tipo, estado_validacion, fecha_vencimiento, observaciones, validado_at, created_at, archivo_path"

export function documentoExpediente(fila: FilaDocumento): DocumentoExpediente {
  return {
    id: fila.id,
    tipo: fila.tipo,
    estado: fila.estado_validacion,
    venceAt: fila.fecha_vencimiento,
    subidoAt: fila.created_at,
    observaciones: fila.observaciones,
    validadoAt: fila.validado_at,
    mime: fila.archivo_path
      ? mimeDeArchivo({ name: fila.archivo_path, type: "" })
      : null,
  }
}
