"use server"

/**
 * Server Actions del marketplace del medio (MED-009, MED-010). Patrón de
 * cada una:
 *
 * 1. DAL (`requerirPermiso`) antes que nada.
 * 2. zod: el MISMO esquema que el cliente.
 * 3. Aceptar y «No me interesa» van por `reservar_cupo_srv` y
 *    `rechazar_oferta_srv` (solo `service_role`) con `contextoDelActor`: la BD
 *    revalida actor, sesión, medio, elegibilidad, cupo, presupuesto, topes y
 *    la clave de idempotencia, y deja la bitácora. La vista se registra con
 *    la sesión del medio (`registrar_vista_oferta`).
 *
 * Ninguna refresca la página: aceptar lleva a la asignación, «No me
 * interesa» vuelve al listado y, si la reserva ya no es posible, la ficha se
 * actualiza al cerrar el aviso. Los errores esperados se devuelven; nunca se
 * lanzan.
 */
import "server-only"

import { contextoDelActor } from "@/lib/auth/contexto-actor"
import { requerirPermiso } from "@/lib/auth/dal"
import {
  type ErrorBd,
  interpretarErrorBd,
  MENSAJE_INESPERADO,
} from "@/lib/errores-bd"
import {
  desdeErrorZod,
  exito,
  fallo,
  MENSAJE_VALIDACION,
  type ResultadoAccion,
} from "@/lib/result"
import { argumentosRpc } from "@/lib/supabase/rpc"
import { crearClienteServidor } from "@/lib/supabase/server"

import {
  falloInesperadoAceptar,
  falloValidacionAceptar,
  interpretarErrorAceptar,
  interpretarErrorRechazo,
} from "./errores"
import {
  type EntradaAceptarOferta,
  type EntradaOfertaMedio,
  type EntradaRechazarOferta,
  esquemaAceptarOferta,
  esquemaOfertaMedio,
  esquemaRechazarOferta,
} from "./schemas"
import type { ResultadoAceptar } from "./tipos"

/** Log de servidor sin datos personales: operación y código. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String((error as ErrorBd).code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[marketplace] ${operacion} falló (${codigo})`)
}

/**
 * Acepta la oferta con una cuenta (MED-010): reserva atómica del cupo con el
 * precio y la comisión congelados. La clave de idempotencia la genera el
 * cliente: el mismo intento repetido (doble toque, respuesta perdida) devuelve
 * la misma asignación en vez de tomar otro cupo. Devuelve el pago congelado:
 * la BD lo recalcula al reservar y puede diferir del que vio el medio.
 */
export async function aceptarOferta(
  entrada: EntradaAceptarOferta
): Promise<ResultadoAceptar> {
  const actor = await requerirPermiso("ofertas.aceptar")
  const validacion = esquemaAceptarOferta.safeParse(entrada)
  if (!validacion.success) {
    return falloValidacionAceptar(
      validacion.error.issues[0]?.message ?? MENSAJE_VALIDACION
    )
  }
  if (!actor.medioId) {
    return interpretarErrorAceptar({
      code: "P0001",
      message: "AMO_NO_ELEGIBLE",
      details: "Tu cuenta aún no está vinculada a un medio.",
    })
  }

  try {
    const contexto = await contextoDelActor(actor)
    const { data, error } = await contexto.admin.rpc("reservar_cupo_srv", {
      p_oferta_id: validacion.data.ofertaId,
      p_medio_id: actor.medioId,
      p_cuenta_social_id: validacion.data.cuentaSocialId,
      p_actor_id: contexto.actorId,
      p_session_id: contexto.sessionId,
      p_clave_idempotencia: validacion.data.claveIdempotencia,
    })
    if (error) {
      const resultado = interpretarErrorAceptar(error)
      if (!resultado.definitivo) informar("aceptarOferta", error)
      return resultado
    }
    const reserva = data?.[0]
    if (!reserva?.asignacion_id) {
      informar("aceptarOferta", { code: "sin_asignacion" })
      return falloInesperadoAceptar()
    }
    // El precio que quedó congelado: la ficha lo compara con el que mostró.
    const congelado: unknown = reserva.monto_medio
    const monto = Number(congelado)
    return exito({
      asignacionId: reserva.asignacion_id,
      montoMedio:
        congelado === null || congelado === undefined || !Number.isFinite(monto)
          ? null
          : monto,
    })
  } catch (error) {
    informar("aceptarOferta", error)
    return falloInesperadoAceptar()
  }
}

/**
 * «No me interesa» (MED-010): la oferta sale del listado del medio y queda en
 * «Ver las que rechacé». El motivo es opcional; lo ve el equipo AMO (el
 * anunciante no ve los rechazos de quien nunca aceptó).
 */
export async function rechazarOferta(
  entrada: EntradaRechazarOferta
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("ofertas.aceptar")
  const validacion = esquemaRechazarOferta.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const contexto = await contextoDelActor(actor)
    const { error } = await contexto.admin.rpc(
      "rechazar_oferta_srv",
      argumentosRpc<"rechazar_oferta_srv">({
        p_oferta_id: validacion.data.ofertaId,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
        p_motivo: validacion.data.motivo,
      })
    )
    if (error) {
      const { mensaje, campo, esperado } = interpretarErrorRechazo(error)
      if (!esperado) informar("rechazarOferta", error)
      return campo ? fallo(mensaje, { [campo]: [mensaje] }) : fallo(mensaje)
    }
    return exito()
  } catch (error) {
    informar("rechazarOferta", error)
    return fallo(MENSAJE_INESPERADO)
  }
}

/**
 * Registra que el medio abrió el detalle (MED-009 c2): alimenta la tasa de
 * aceptación y quita la marca «Nueva» del listado. La llama la ficha al
 * mostrarse (no al prefetch de un enlace); un fallo no interrumpe nada.
 */
export async function registrarVistaOferta(
  entrada: EntradaOfertaMedio
): Promise<ResultadoAccion> {
  await requerirPermiso("ofertas.marketplace")
  const validacion = esquemaOfertaMedio.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const supabase = await crearClienteServidor()
    const { error } = await supabase.rpc("registrar_vista_oferta", {
      p_oferta_id: validacion.data.ofertaId,
    })
    if (error) {
      const { mensaje, esperado } = interpretarErrorBd(error)
      if (!esperado) informar("registrarVistaOferta", error)
      return fallo(mensaje)
    }
    return exito()
  } catch (error) {
    informar("registrarVistaOferta", error)
    return fallo(MENSAJE_INESPERADO)
  }
}
