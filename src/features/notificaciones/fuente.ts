"use client"

/**
 * Fuente de datos de notificaciones en el navegador (React Query).
 *
 * - Conteo de no leídas por polling cada 60 s (docs/modelo-datos.md §9.1) y
 *   lista breve para el panel de la campana. Se leen con el cliente de
 *   Supabase del NAVEGADOR (JWT del usuario + RLS: solo las propias) y no con
 *   Server Actions: estas pasan por el DAL, que registra actividad de la
 *   sesión, y un sondeo automático nunca debe contar como actividad (anularía
 *   el cierre por inactividad).
 * - Las escrituras sí van por Server Actions (DAL + zod) y, al terminar,
 *   invalidan todas las consultas `["notificaciones", …]`.
 */
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import type { SupabaseClient } from "@supabase/supabase-js"

import { obtenerClienteNavegador } from "@/lib/supabase/client"

import { marcarNotificaciones, marcarTodasLeidas } from "./actions"
import { aplicarAConteo, aplicarALista, type CambioLectura } from "./lecturas"
import {
  conteoDesdeRespuesta,
  notificacionesDesdeRespuesta,
} from "./respuestas"
import {
  COLUMNAS_NOTIFICACION,
  type ConteoNoLeidas,
  type Notificacion,
} from "./tipos"

export const INTERVALO_SONDEO_MS = 60_000
/** Cuántas muestra el panel de la campana (la bandeja completa pagina). */
export const RECIENTES_EN_PANEL = 8

export const CLAVES_NOTIFICACIONES = {
  todas: ["notificaciones"] as const,
  conteo: ["notificaciones", "no-leidas"] as const,
  recientes: ["notificaciones", "recientes"] as const,
}

export interface Recientes {
  disponible: boolean
  notificaciones: Notificacion[]
}

/** TEMPORAL (M8): cliente sin tipos hasta regenerar `database.types.ts`. */
function cliente(): SupabaseClient {
  return obtenerClienteNavegador() as unknown as SupabaseClient
}

export async function leerConteoNoLeidas(): Promise<ConteoNoLeidas> {
  return conteoDesdeRespuesta(
    await cliente()
      .from("notificaciones")
      .select("id", { count: "exact", head: true })
      .eq("leida", false)
  )
}

export async function leerRecientes(): Promise<Recientes> {
  const notificaciones = notificacionesDesdeRespuesta(
    await cliente()
      .from("notificaciones")
      .select(COLUMNAS_NOTIFICACION)
      .order("id", { ascending: false })
      .limit(RECIENTES_EN_PANEL)
  )
  return notificaciones
    ? { disponible: true, notificaciones }
    : { disponible: false, notificaciones: [] }
}

/**
 * Conteo de no leídas con sondeo cada 60 s (solo con la pestaña visible). Si
 * la tabla aún no existe deja de sondear. `inicial`: el conteo que ya trae el
 * servidor (evita un salto al hidratar).
 */
export function useConteoNoLeidas(inicial?: ConteoNoLeidas) {
  return useQuery({
    queryKey: CLAVES_NOTIFICACIONES.conteo,
    queryFn: leerConteoNoLeidas,
    initialData: inicial,
    staleTime: INTERVALO_SONDEO_MS / 2,
    refetchInterval: (consulta) =>
      consulta.state.data?.disponible === false ? false : INTERVALO_SONDEO_MS,
    refetchOnWindowFocus: true,
  })
}

/** Últimas notificaciones para el panel de la campana; solo se piden al abrirlo. */
export function useNotificacionesRecientes(activo: boolean) {
  return useQuery({
    queryKey: CLAVES_NOTIFICACIONES.recientes,
    queryFn: leerRecientes,
    enabled: activo,
    staleTime: 15_000,
  })
}

// ── Escrituras ───────────────────────────────────────────────────────────────

function aplicarEnCache(cliente: QueryClient, cambio: CambioLectura): void {
  const recientes = cliente.getQueryData<Recientes>(
    CLAVES_NOTIFICACIONES.recientes
  )
  cliente.setQueryData<ConteoNoLeidas>(
    CLAVES_NOTIFICACIONES.conteo,
    (previo) =>
      previo
        ? aplicarAConteo(previo, cambio, recientes?.notificaciones)
        : previo
  )
  cliente.setQueryData<Recientes>(CLAVES_NOTIFICACIONES.recientes, (previo) =>
    previo
      ? {
          ...previo,
          notificaciones: aplicarALista(previo.notificaciones, cambio),
        }
      : previo
  )
}

/**
 * Marcar como leídas / no leídas (o todas). Actualiza la caché al instante y
 * al terminar vuelve a pedir el estado real; si falla, lanza para que la
 * interfaz avise (la revalidación deshace el cambio optimista).
 */
export function useMarcarNotificaciones() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: async (cambio: CambioLectura) => {
      const resultado =
        "todas" in cambio
          ? await marcarTodasLeidas()
          : await marcarNotificaciones({
              ids: [...cambio.ids],
              leida: cambio.leida,
            })
      if (!resultado.ok) throw new Error(resultado.error)
    },
    onMutate: async (cambio) => {
      await cliente.cancelQueries({ queryKey: CLAVES_NOTIFICACIONES.todas })
      aplicarEnCache(cliente, cambio)
    },
    onSettled: () =>
      cliente.invalidateQueries({ queryKey: CLAVES_NOTIFICACIONES.todas }),
  })
}
