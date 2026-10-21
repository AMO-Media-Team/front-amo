import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { crearClienteServidor } from "@/lib/supabase/server"

import { type FiltrosBandeja, TAMANO_PAGINA } from "./esquemas"
import { filtroCategoria } from "./presentacion"
import {
  conteoDesdeRespuesta,
  notificacionesDesdeRespuesta,
} from "./respuestas"
import {
  COLUMNAS_NOTIFICACION,
  type ConteoNoLeidas,
  type PaginaNotificaciones,
} from "./tipos"

/**
 * Lecturas de la bandeja con la sesión del USUARIO: la RLS de
 * `notificaciones` devuelve solo las propias (§3.7). TEMPORAL: la tabla llega
 * con la migración 8; mientras no exista (PGRST205/42P01) la bandeja queda
 * vacía y lo indica, en lugar de fallar.
 */

/** TEMPORAL (M8): cliente sin tipos hasta regenerar `database.types.ts`. */
async function clienteSinTipos(): Promise<SupabaseClient> {
  return (await crearClienteServidor()) as unknown as SupabaseClient
}

export async function listarNotificaciones(
  filtros: FiltrosBandeja,
  antesId: number | null = null
): Promise<PaginaNotificaciones> {
  const supabase = await clienteSinTipos()
  let consulta = supabase
    .from("notificaciones")
    .select(COLUMNAS_NOTIFICACION)
    .order("id", { ascending: false })
    .limit(TAMANO_PAGINA + 1)
  if (filtros.estado !== "todas") {
    consulta = consulta.eq("leida", filtros.estado === "leidas")
  }
  if (filtros.categoria)
    consulta = consulta.or(filtroCategoria(filtros.categoria))
  if (antesId !== null) consulta = consulta.lt("id", antesId)

  const todas = notificacionesDesdeRespuesta(await consulta)
  if (!todas) return { disponible: false, notificaciones: [], siguiente: null }
  const notificaciones = todas.slice(0, TAMANO_PAGINA)
  return {
    disponible: true,
    notificaciones,
    siguiente:
      todas.length > TAMANO_PAGINA ? (notificaciones.at(-1)?.id ?? null) : null,
  }
}

/** Sin leer de la persona (conteo inicial de la bandeja; luego lo sondea el cliente). */
export async function contarNoLeidas(): Promise<ConteoNoLeidas> {
  const supabase = await clienteSinTipos()
  return conteoDesdeRespuesta(
    await supabase
      .from("notificaciones")
      .select("id", { count: "exact", head: true })
      .eq("leida", false)
  )
}
