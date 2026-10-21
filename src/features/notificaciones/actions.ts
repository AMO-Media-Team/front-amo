"use server"

/**
 * Server Actions de notificaciones. Cada una exige `notificaciones.ver` (DAL)
 * y escribe con la sesión del USUARIO: la RLS limita a las propias y el
 * privilegio de columna solo permite `update (leida, leida_at)` (§3.7). No
 * llaman a `refresh()`: la bandeja y la campana actualizan su estado en el
 * cliente (optimista + invalidación de React Query).
 */
import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { requerirPermiso } from "@/lib/auth/dal"
import { desdeErrorZod, exito, fallo, type ResultadoAccion } from "@/lib/result"
import { crearClienteServidor } from "@/lib/supabase/server"

import { esquemaMarcar, esquemaPagina, type FiltrosBandeja } from "./esquemas"
import { listarNotificaciones } from "./queries"
import type { PaginaNotificaciones } from "./tipos"

const PERMISO = "notificaciones.ver"
/** Va como detalle bajo el título del aviso («No pudimos marcar…»). */
const MENSAJE_INESPERADO = "Intenta de nuevo en unos segundos."

function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[notificaciones] ${operacion} falló (${codigo})`)
}

/** TEMPORAL (M8): cliente sin tipos hasta regenerar `database.types.ts`. */
async function clienteSinTipos(): Promise<SupabaseClient> {
  return (await crearClienteServidor()) as unknown as SupabaseClient
}

function cambiosLectura(leida: boolean) {
  return { leida, leida_at: leida ? new Date().toISOString() : null }
}

/** Marca como leídas (o no leídas) notificaciones propias. */
export async function marcarNotificaciones(entrada: {
  ids: number[]
  leida: boolean
}): Promise<ResultadoAccion> {
  await requerirPermiso(PERMISO)
  const validacion = esquemaMarcar.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  try {
    const supabase = await clienteSinTipos()
    const { error } = await supabase
      .from("notificaciones")
      .update(cambiosLectura(validacion.data.leida))
      .in("id", validacion.data.ids)
    if (error) {
      informar("marcarNotificaciones", error)
      return fallo(MENSAJE_INESPERADO)
    }
    return exito()
  } catch (error) {
    informar("marcarNotificaciones", error)
    return fallo(MENSAJE_INESPERADO)
  }
}

/** Todas las propias sin leer → leídas. */
export async function marcarTodasLeidas(): Promise<ResultadoAccion> {
  await requerirPermiso(PERMISO)
  try {
    const supabase = await clienteSinTipos()
    const { error } = await supabase
      .from("notificaciones")
      .update(cambiosLectura(true))
      .eq("leida", false)
    if (error) {
      informar("marcarTodasLeidas", error)
      return fallo(MENSAJE_INESPERADO)
    }
    return exito()
  } catch (error) {
    informar("marcarTodasLeidas", error)
    return fallo(MENSAJE_INESPERADO)
  }
}

/** Página siguiente de la bandeja (cursor por `id`). */
export async function cargarNotificaciones(entrada: {
  filtros: FiltrosBandeja
  antesId: number
}): Promise<ResultadoAccion<PaginaNotificaciones>> {
  await requerirPermiso(PERMISO)
  const validacion = esquemaPagina.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  try {
    return exito(
      await listarNotificaciones(
        validacion.data.filtros,
        validacion.data.antesId
      )
    )
  } catch (error) {
    informar("cargarNotificaciones", error)
    return fallo("No pudimos cargar más notificaciones.")
  }
}
