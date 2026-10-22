/**
 * Filas de la BD → contratos de la interfaz (módulo puro). Aquí se descarta la
 * ruta del objeto en Storage: solo se conserva el formato que deja ver su
 * extensión, para que el visor sepa si muestra una imagen o un PDF.
 */
import { esMimeConocido, mimeDeArchivo } from "@/lib/archivos/mime"
import type { Database } from "@/types/database.types"

import { esNivel } from "./requisitos"
import type {
  DocumentoCargado,
  MedioDocumentos,
  PerfilTributario,
  RequisitosNivel,
} from "./tipos"

type Tablas = Database["public"]["Tables"]

export type FilaDocumento = Pick<
  Tablas["documentos_medio"]["Row"],
  | "id"
  | "tipo"
  | "estado_validacion"
  | "metodo"
  | "observaciones"
  | "fecha_vencimiento"
  | "created_at"
  | "validado_at"
  | "archivo_path"
>

export type FilaNivel = Pick<
  Tablas["niveles_verificacion"]["Row"],
  "nivel" | "nombre" | "requisitos" | "documentos_requeridos"
>

export type FilaPerfilTributario = Pick<
  Tablas["medios_privado"]["Row"],
  | "metodo_pago"
  | "datos_pago_cambiados_at"
  | "tipo_documento"
  | "es_declarante"
  | "obligado_facturar"
  | "responsable_iva"
>

export type FilaMedio = Pick<
  Tablas["medios"]["Row"],
  "id" | "nombre" | "estado" | "nivel_verificacion" | "enviado_verificacion_at"
>

/** MIME del objeto según la extensión de su ruta; `null` si no hay archivo. */
export function formatoDeRuta(ruta: string | null): string | null {
  if (!ruta) return null
  const mime = mimeDeArchivo({ name: ruta, type: "" })
  return esMimeConocido(mime) ? mime : null
}

export function aDocumentoCargado(fila: FilaDocumento): DocumentoCargado {
  return {
    id: fila.id,
    tipo: fila.tipo,
    estado: fila.estado_validacion,
    metodo: fila.metodo === "VIDEOLLAMADA" ? "VIDEOLLAMADA" : "ARCHIVO",
    observaciones: fila.observaciones?.trim() || null,
    venceEl: fila.fecha_vencimiento,
    cargadoAt: fila.created_at,
    revisadoAt: fila.validado_at,
    formato: formatoDeRuta(fila.archivo_path),
  }
}

/** Niveles válidos (1–3) en orden; una fila fuera de rango se ignora. */
export function aRequisitosNiveles(
  filas: readonly FilaNivel[]
): RequisitosNivel[] {
  return filas
    .flatMap((fila) =>
      esNivel(fila.nivel)
        ? [
            {
              nivel: fila.nivel,
              nombre: fila.nombre,
              requisitos: fila.requisitos,
              documentos: fila.documentos_requeridos,
            },
          ]
        : []
    )
    .sort((a, b) => a.nivel - b.nivel)
}

/** Sin fila en `medios_privado` (aún no registra pago): nada declarado. */
export function aPerfilTributario(
  fila: FilaPerfilTributario | null
): PerfilTributario {
  return {
    metodoPago: fila?.metodo_pago ?? null,
    datosPagoCambiadosAt: fila?.datos_pago_cambiados_at ?? null,
    tipoDocumento: fila?.tipo_documento ?? null,
    esDeclarante: fila?.es_declarante ?? false,
    obligadoFacturar: fila?.obligado_facturar ?? false,
    responsableIva: fila?.responsable_iva ?? false,
  }
}

export function aMedioDocumentos(fila: FilaMedio): MedioDocumentos {
  return {
    id: fila.id,
    nombre: fila.nombre,
    estado: fila.estado,
    nivel: fila.nivel_verificacion,
    enviadoVerificacionAt: fila.enviado_verificacion_at,
  }
}
