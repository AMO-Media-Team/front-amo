/**
 * Ráfagas concurrentes contra la BD real y lectura del estado resultante.
 * Las llamadas de una ráfaga se crean todas antes de esperar ninguna, de modo
 * que PostgREST las atiende en paralelo hasta el tamaño de su pool.
 */
import type { ClienteSupabase } from "../../bootstrap/supabase"
import type { Actor } from "./cuentas"
import {
  type AsignacionFila,
  type CampanaFila,
  type CupoFila,
  type Instantanea,
  type IntentoReserva,
  type OfertaFila,
} from "./invariantes"

export interface Reserva {
  ofertaId: string
  medioId: string
  cuentaId: string
  actor: Actor
  claveIdempotencia?: string
}

export interface Desistimiento {
  ofertaId: string
  actor: Actor
}

export async function reservar(
  servicio: ClienteSupabase,
  reserva: Reserva
): Promise<IntentoReserva> {
  const { data, error } = await servicio.rpc("reservar_cupo_srv", {
    p_oferta_id: reserva.ofertaId,
    p_medio_id: reserva.medioId,
    p_cuenta_social_id: reserva.cuentaId,
    p_actor_id: reserva.actor.usuarioId,
    p_session_id: reserva.actor.sesionId,
    ...(reserva.claveIdempotencia
      ? { p_clave_idempotencia: reserva.claveIdempotencia }
      : {}),
  })
  if (error)
    return {
      asignacionId: null,
      error: { code: error.code, message: error.message },
    }
  return { asignacionId: data[0]?.asignacion_id ?? null, error: null }
}

/** El medio desiste de su aceptación (ACEPTADA → RECHAZADA y libera el cupo). */
export async function desistir(
  servicio: ClienteSupabase,
  desistimiento: Desistimiento
): Promise<IntentoReserva> {
  const { data, error } = await servicio.rpc("rechazar_oferta_srv", {
    p_oferta_id: desistimiento.ofertaId,
    p_actor_id: desistimiento.actor.usuarioId,
    p_session_id: desistimiento.actor.sesionId,
    p_motivo: "Prueba de carrera: el medio desiste",
  })
  if (error)
    return {
      asignacionId: null,
      error: { code: error.code, message: error.message },
    }
  return { asignacionId: data, error: null }
}

export interface Rafaga<T> {
  resultados: T[]
  duracionMs: number
}

export async function rafaga<T>(
  llamadas: readonly (() => Promise<T>)[]
): Promise<Rafaga<T>> {
  const inicio = performance.now()
  const resultados = await Promise.all(llamadas.map((llamada) => llamada()))
  return { resultados, duracionMs: Math.round(performance.now() - inicio) }
}

function exigir<T>(
  resultado: { data: T | null; error: { message: string } | null },
  que: string
): T {
  if (resultado.error || resultado.data === null) {
    throw new Error(
      `No se pudo leer ${que}: ${resultado.error?.message ?? "sin datos"}`
    )
  }
  return resultado.data
}

/** Estado de una campaña, sus ofertas, cupos, asignaciones y montos (lectura con la secret key). */
export async function leerInstantanea(
  servicio: ClienteSupabase,
  campanaId: string
): Promise<Instantanea> {
  const campana: CampanaFila = exigir(
    await servicio
      .from("campanas")
      .select("id, presupuesto_total, presupuesto_comprometido")
      .eq("id", campanaId)
      .single(),
    "la campaña"
  )
  const ofertas: OfertaFila[] = exigir(
    await servicio
      .from("ofertas")
      .select(
        "id, estado, presupuesto_maximo, presupuesto_comprometido, cupos_totales, cupos_ocupados, tope_porcentaje_por_medio, ventana_inicio, fecha_limite_aceptacion"
      )
      .eq("campana_id", campanaId),
    "las ofertas"
  )
  const ids = ofertas.map((o) => o.id)
  const cupos: CupoFila[] = exigir(
    await servicio
      .from("oferta_cupos")
      .select("oferta_id, franja_id, cupos_totales, cupos_ocupados")
      .in("oferta_id", ids),
    "los cupos"
  )
  const asignaciones: AsignacionFila[] = exigir(
    await servicio
      .from("asignaciones")
      .select(
        "id, oferta_id, medio_id, franja_id, estado, estado_previo_disputa, monto_bruto, aceptada_at"
      )
      .eq("campana_id", campanaId),
    "las asignaciones"
  )
  const montos = exigir(
    await servicio
      .from("asignacion_montos")
      .select("asignacion_id")
      .in(
        "asignacion_id",
        asignaciones.map((a) => a.id)
      ),
    "los montos"
  )
  return {
    campana,
    ofertas,
    cupos,
    asignaciones,
    montos: montos.map((m) => m.asignacion_id),
    leidaEn: Date.now(),
  }
}
