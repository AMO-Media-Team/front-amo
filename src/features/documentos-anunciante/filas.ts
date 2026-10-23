/**
 * Filas de la BD → contratos de la interfaz (módulo puro). Aquí se descarta la
 * ruta del objeto en Storage: solo se conserva el formato que deja ver su
 * extensión, para que el visor sepa si muestra una imagen o un PDF.
 */
import { formatoDeRuta } from "@/features/documentos-medio/filas"
import type { Database } from "@/types/database.types"

import type { DocumentoAnunciante, EmpresaDocumentos } from "./tipos"

type Tablas = Database["public"]["Tables"]

export type FilaDocumentoAnunciante = Pick<
  Tablas["documentos_anunciante"]["Row"],
  | "id"
  | "tipo"
  | "estado_validacion"
  | "observaciones"
  | "fecha_vencimiento"
  | "created_at"
  | "validado_at"
  | "archivo_path"
>

/** Columnas que leen la lista y las acciones (mismo orden que `FilaDocumentoAnunciante`). */
export const COLUMNAS_DOCUMENTO_ANUNCIANTE =
  "id, tipo, estado_validacion, observaciones, fecha_vencimiento, created_at, validado_at, archivo_path"

export type FilaEmpresaDocumentos = Pick<
  Tablas["anunciantes"]["Row"],
  | "id"
  | "nombre_comercial"
  | "pais_iso2"
  | "estado_verificacion"
  | "enviado_verificacion_at"
  | "identificacion_cambiada_at"
>

export function aDocumentoAnunciante(
  fila: FilaDocumentoAnunciante
): DocumentoAnunciante {
  return {
    id: fila.id,
    tipo: fila.tipo,
    estado: fila.estado_validacion,
    observaciones: fila.observaciones?.trim() || null,
    venceEl: fila.fecha_vencimiento,
    cargadoAt: fila.created_at,
    revisadoAt: fila.validado_at,
    formato: formatoDeRuta(fila.archivo_path),
  }
}

export function aEmpresaDocumentos(
  fila: FilaEmpresaDocumentos
): EmpresaDocumentos {
  return {
    id: fila.id,
    nombre: fila.nombre_comercial,
    // `char(2)`: se recorta por si la BD lo devuelve con relleno.
    pais: fila.pais_iso2.trim().toUpperCase(),
    estado: fila.estado_verificacion,
    enviadoVerificacionAt: fila.enviado_verificacion_at,
    identificacionCambiadaAt: fila.identificacion_cambiada_at,
  }
}
