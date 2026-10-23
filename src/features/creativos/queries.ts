import "server-only"

/**
 * Lecturas del paquete creativo con la sesión de quien consulta (la RLS de
 * `creativos` le muestra las de sus ofertas, a quien tiene `ofertas.ver`
 * todas y al medio solo las versiones activadas). La página o la acción que
 * las llama ya pasó el DAL.
 */
import { cache } from "react"

import { crearClienteServidor } from "@/lib/supabase/server"

import { aFormatoOferta, LIMITES_POR_DEFECTO } from "./formatos"
import {
  aVersionCreativo,
  CLAVES_LIMITES,
  COLUMNAS_CREATIVO,
  type FilaCreativo,
  limitesDeConfiguracion,
  ordenarVersiones,
  resolverEdicion,
} from "./filas"
import type { DatosCreativo, LimitesCreativo, VersionCreativo } from "./tipos"

interface ErrorConsulta {
  code?: string | null
}

function fallar(operacion: string, error: ErrorConsulta): never {
  throw new Error(`No se pudo ${operacion} (${error.code ?? "sin código"}).`)
}

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>

async function versionesDe(
  supabase: Cliente,
  ofertaId: string
): Promise<VersionCreativo[]> {
  const { data, error } = await supabase
    .from("creativos")
    .select(COLUMNAS_CREATIVO)
    .eq("oferta_id", ofertaId)
    .order("version", { ascending: false })
  if (error) fallar("leer los creativos de la oferta", error)
  return ordenarVersiones((data as FilaCreativo[]).map(aVersionCreativo))
}

/**
 * Versiones del creativo de una oferta, de la más nueva a la más vieja: la
 * pendiente (si la hay), la vigente y el historial, cada una con sus archivos
 * en orden. Vacío si la oferta no tiene creativo o la persona no la ve.
 */
export async function creativosDeOferta(
  ofertaId: string
): Promise<VersionCreativo[]> {
  return versionesDe(await crearClienteServidor(), ofertaId)
}

/**
 * `archivos.max_creativo_mb` y `archivos.tolerancia_aspecto` (públicas: las
 * lee el anunciante). Si no se pueden leer rigen los valores de la semilla:
 * la BD vuelve a imponer los vigentes al guardar cada archivo.
 */
export const limitesCreativo = cache(async (): Promise<LimitesCreativo> => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from("configuracion")
    .select("clave, valor")
    .in("clave", Object.values(CLAVES_LIMITES))
  return error
    ? LIMITES_POR_DEFECTO
    : limitesDeConfiguracion(data, LIMITES_POR_DEFECTO)
})

/**
 * Lo que pinta el panel creativo de una oferta: estado, formato, topes y la
 * versión editable. `null` si la oferta no existe o la sesión no la ve. Con
 * `comoAnunciante`, además, si su empresa puede activar versiones nuevas
 * (`activar_creativo_srv` exige que esté verificada).
 */
export async function datosCreativo(
  ofertaId: string,
  puedeGestionar: boolean,
  comoAnunciante = false
): Promise<DatosCreativo | null> {
  const supabase = await crearClienteServidor()
  const [oferta, versiones, limites] = await Promise.all([
    supabase
      .from("ofertas")
      .select(
        "id, estado, deleted_at, formato:formatos!ofertas_formato_fkey ( id, plataforma, clave, nombre, requisitos ), anunciante:anunciantes!ofertas_anunciante_id_fkey ( estado_verificacion )"
      )
      .eq("id", ofertaId)
      .maybeSingle(),
    versionesDe(supabase, ofertaId),
    limitesCreativo(),
  ])
  if (oferta.error) fallar("leer la oferta", oferta.error)
  const fila = oferta.data
  if (!fila?.formato) return null
  const edicion = resolverEdicion(versiones, fila.estado, {
    puedeGestionar,
    archivada: fila.deleted_at !== null,
    estadoEmpresa: comoAnunciante
      ? (fila.anunciante?.estado_verificacion ?? null)
      : undefined,
  })
  return {
    ofertaId: fila.id,
    estadoOferta: fila.estado,
    formato: aFormatoOferta(fila.formato),
    limites,
    ...edicion,
  }
}
