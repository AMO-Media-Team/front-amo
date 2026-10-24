import "server-only"

/**
 * Lecturas del documento soporte (contrato de la fase 5), con el cliente del USUARIO (JWT + RLS): el
 * equipo con `liquidaciones.ver` lee `documentos_soporte`; el medio ya no (lo ve por RPC). Un error de
 * lectura se lanza y lo recoge el límite de error de la sección que las monta.
 */
import { cache } from "react"

import { clienteSolicitud, fallar } from "@/features/operacion/queries/comun"
import { requerirUsuario, tieneAlgunPermiso } from "@/lib/auth/dal"

import {
  COLUMNAS_DOCUMENTO,
  type FilaDocumentoSoporte,
  fichaDocumentoSoporte,
  leerNumeracion,
} from "./presentacion"
import type { DocumentoSoporteFicha, NumeracionDocumentoSoporte } from "./tipos"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Clave de configuración que dice quién numera (D75: un rango se usa en un solo sistema). */
export const CLAVE_NUMERACION = "tributario.numeracion_documento_soporte"

const leerDocumentos = cache(
  async (liquidacionId: string): Promise<DocumentoSoporteFicha | null> => {
    if (!UUID.test(liquidacionId)) return null
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase
      .from("documentos_soporte")
      .select(COLUMNAS_DOCUMENTO)
      .eq("liquidacion_id", liquidacionId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(50)
    if (error) fallar("leer el documento soporte", error)
    return fichaDocumentoSoporte(data as FilaDocumentoSoporte[])
  }
)

const leerNumeracionVigente = cache(
  async (): Promise<NumeracionDocumentoSoporte> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase
      .from("configuracion")
      .select("valor")
      .eq("clave", CLAVE_NUMERACION)
      .maybeSingle()
    if (error) fallar("leer la numeración del documento soporte", error)
    return leerNumeracion(data?.valor)
  }
)

/**
 * Documento soporte de una liquidación (`null` si no lleva o aún no existe): el vigente o el último, con
 * los anulados anteriores. Una lectura por solicitud. Sin `datos_sensibles.ver`, marca sus archivos como
 * reservados (`archivosReservados`): la sección no ofrece descargarlos.
 */
export async function documentoSoporteDeLiquidacion(
  liquidacionId: string
): Promise<DocumentoSoporteFicha | null> {
  const [ficha, usuario] = await Promise.all([
    leerDocumentos(liquidacionId),
    requerirUsuario(),
  ])
  if (!ficha) return null
  return {
    ...ficha,
    archivosReservados: !tieneAlgunPermiso(usuario, ["datos_sensibles.ver"]),
  }
}

/** Valor vigente de `tributario.numeracion_documento_soporte`. */
export async function numeracionDocumentoSoporte(): Promise<NumeracionDocumentoSoporte> {
  return leerNumeracionVigente()
}
