import "server-only"

import { cache } from "react"

import { serializarFecha } from "@/lib/fechas"
import { crearClienteServidor } from "@/lib/supabase/server"

import {
  aDocumentoAnunciante,
  aEmpresaDocumentos,
  COLUMNAS_DOCUMENTO_ANUNCIANTE,
} from "./filas"
import type { DatosDocumentosAnunciante } from "./tipos"

/**
 * Lecturas de «Mi empresa › Documentos» con el cliente del USUARIO (JWT +
 * RLS): la empresa solo ve sus filas (`documentos_anunciante: select propio`).
 * Un error se lanza y lo recoge el límite de error de la sección.
 */

/** Tope de seguridad: una empresa carga unas pocas versiones de cada documento. */
const MAXIMO_DOCUMENTOS = 200

function fallar(operacion: string, error: { code?: string | null }): never {
  throw new Error(`No se pudo ${operacion} (${error.code ?? "sin código"}).`)
}

/**
 * La empresa (país, estado, envío a verificación y último cambio de su
 * identificación) y todas sus cargas. `null` si la empresa no existe o ya no
 * es visible para la sesión.
 */
export const datosDocumentosAnunciante = cache(
  async (anuncianteId: string): Promise<DatosDocumentosAnunciante | null> => {
    const supabase = await crearClienteServidor()
    const [empresa, documentos] = await Promise.all([
      supabase
        .from("anunciantes")
        .select(
          "id, nombre_comercial, pais_iso2, estado_verificacion, enviado_verificacion_at, identificacion_cambiada_at"
        )
        .eq("id", anuncianteId)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("documentos_anunciante")
        .select(COLUMNAS_DOCUMENTO_ANUNCIANTE)
        .eq("anunciante_id", anuncianteId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(MAXIMO_DOCUMENTOS),
    ])
    if (empresa.error) fallar("leer la empresa", empresa.error)
    if (documentos.error) fallar("leer los documentos", documentos.error)
    if (!empresa.data) return null
    return {
      empresa: aEmpresaDocumentos(empresa.data),
      documentos: documentos.data.map(aDocumentoAnunciante),
      hoy: serializarFecha(new Date()),
    }
  }
)
