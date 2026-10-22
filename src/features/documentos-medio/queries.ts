import "server-only"

import { cache } from "react"

import { serializarFecha } from "@/lib/fechas"
import { crearClienteServidor } from "@/lib/supabase/server"

import {
  aDocumentoCargado,
  aMedioDocumentos,
  aPerfilTributario,
  aRequisitosNiveles,
} from "./filas"
import type { DatosDocumentosMedio } from "./tipos"

/**
 * Lecturas de «Mis documentos» con el cliente del USUARIO (JWT + RLS): el medio
 * solo ve sus filas (`documentos_medio: select propio`) y, de `medios_privado`,
 * las columnas sin cifrar. Un error se lanza y lo recoge el límite de error de
 * la sección.
 */

/** Tope de seguridad: un medio carga unas pocas versiones de cada documento. */
const MAXIMO_DOCUMENTOS = 300

function fallar(operacion: string, error: { code?: string | null }): never {
  throw new Error(`No se pudo ${operacion} (${error.code ?? "sin código"}).`)
}

/**
 * Todo lo que necesita la lista: el medio, lo que declaró para el pago (decide
 * el certificado exigido), los requisitos de cada nivel y todas sus cargas.
 * `null` si el medio no existe o ya no es visible para la sesión.
 */
export const datosDocumentosMedio = cache(
  async (medioId: string): Promise<DatosDocumentosMedio | null> => {
    const supabase = await crearClienteServidor()
    const [medio, perfil, niveles, documentos] = await Promise.all([
      supabase
        .from("medios")
        .select(
          "id, nombre, estado, nivel_verificacion, enviado_verificacion_at"
        )
        .eq("id", medioId)
        .maybeSingle(),
      supabase
        .from("medios_privado")
        .select(
          "metodo_pago, tipo_documento, es_declarante, obligado_facturar, responsable_iva"
        )
        .eq("medio_id", medioId)
        .maybeSingle(),
      supabase
        .from("niveles_verificacion")
        .select("nivel, nombre, requisitos, documentos_requeridos")
        .order("nivel"),
      supabase
        .from("documentos_medio")
        .select(
          "id, tipo, estado_validacion, metodo, observaciones, fecha_vencimiento, created_at, validado_at, archivo_path"
        )
        .eq("medio_id", medioId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(MAXIMO_DOCUMENTOS),
    ])
    if (medio.error) fallar("leer el medio", medio.error)
    if (perfil.error) fallar("leer los datos de pago", perfil.error)
    if (niveles.error) fallar("leer los niveles", niveles.error)
    if (documentos.error) fallar("leer los documentos", documentos.error)
    if (!medio.data) return null
    return {
      medio: aMedioDocumentos(medio.data),
      perfil: aPerfilTributario(perfil.data),
      niveles: aRequisitosNiveles(niveles.data),
      documentos: documentos.data.map(aDocumentoCargado),
      hoy: serializarFecha(new Date()),
    }
  }
)
