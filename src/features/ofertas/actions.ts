"use server"

/**
 * Server Actions sobre una oferta (ANU-009, ANU-014): enviar o reenviar a
 * revisión, retirarla de revisión, cancelarla y archivarla. Las usa el
 * anunciante con lo suyo y el equipo AMO por cuenta de un anunciante
 * (ADM-014). Patrón de cada una:
 *
 * 1. DAL antes que nada: `ofertas.gestionar_propias` (el anunciante) o
 *    `ofertas.gestionar` (el equipo AMO); la BD decide propiedad o permiso
 *    de la transición según el tipo de actor (y pide motivo al equipo AMO
 *    para cancelar un borrador o una devuelta).
 * 2. zod: el MISMO esquema que el cliente.
 * 3. El cambio de estado va por `transicionar` (`transicionar_srv` con actor
 *    y sesión): la BD revalida propiedad, estado, condiciones del envío,
 *    presupuesto disponible y asignaciones, y deja historial y bitácora.
 *    Archivar va por `archivar_oferta_srv`, también con actor y sesión.
 * 4. `refresh()` para que la ficha y la campaña muestren el estado nuevo
 *    (salvo al archivar: la ficha ya no existe y el cliente sale de ella).
 *
 * Los errores esperados se devuelven como `ResultadoAccion`; nunca se lanzan.
 */
import "server-only"

import { refresh } from "next/cache"

import { PERMISOS_GESTION_OFERTAS } from "@/features/campanas/gestion"
import { contextoDelActor } from "@/lib/auth/contexto-actor"
import { requerirPermiso } from "@/lib/auth/dal"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { type ErrorBd, MENSAJE_INESPERADO } from "@/lib/errores-bd"
import {
  type SolicitudTransicion,
  transicionar,
} from "@/lib/negocio/transicionar"
import {
  desdeErrorZod,
  exito,
  fallo,
  type ResultadoAccion,
  type ResultadoFallo,
} from "@/lib/result"

import { interpretarErrorOferta } from "./errores"
import {
  type EntradaCancelarOferta,
  type EntradaOferta,
  esquemaCancelarOferta,
  esquemaOferta,
} from "./schemas"
import type { ResultadoEnvio } from "./tipos"

/** Log de servidor sin datos personales: operación y código. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[ofertas] ${operacion} falló (${codigo})`)
}

function falloBd(operacion: string, error: ErrorBd): ResultadoFallo {
  const { mensaje, campo, esperado } = interpretarErrorOferta(error)
  if (!esperado) informar(operacion, error)
  return campo ? fallo(mensaje, { [campo]: [mensaje] }) : fallo(mensaje)
}

/** Ejecuta la transición ya validada y refresca la página si sale bien. */
async function aplicar(
  actor: UsuarioSesion,
  operacion: string,
  solicitud: SolicitudTransicion<"ofertas">
): Promise<ResultadoAccion> {
  try {
    const contexto = await contextoDelActor(actor)
    const { error } = await transicionar(contexto, solicitud)
    if (error) return falloBd(operacion, error)
    refresh()
    return exito()
  } catch (error) {
    informar(operacion, error)
    return fallo(MENSAJE_INESPERADO)
  }
}

/**
 * Envía (o reenvía, si estaba devuelta) la oferta a revisión. Si la BD dice
 * qué paso del asistente falta, el fallo lo lleva para enlazarlo.
 */
export async function enviarOfertaARevision(
  entrada: EntradaOferta
): Promise<ResultadoEnvio> {
  const actor = await requerirPermiso(PERMISOS_GESTION_OFERTAS)
  const validacion = esquemaOferta.safeParse(entrada)
  if (!validacion.success) {
    return { ...desdeErrorZod(validacion.error), paso: null }
  }

  try {
    const contexto = await contextoDelActor(actor)
    const { error } = await transicionar(contexto, {
      entidad: "ofertas",
      id: validacion.data.ofertaId,
      hacia: "EN_REVISION",
    })
    if (error) {
      const { paso } = interpretarErrorOferta(error)
      return { ...falloBd("enviarOfertaARevision", error), paso }
    }
    refresh()
    return exito()
  } catch (error) {
    informar("enviarOfertaARevision", error)
    return { ...fallo(MENSAJE_INESPERADO), paso: null }
  }
}

/** Retira la oferta de revisión: vuelve a borrador para editarla. */
export async function retirarOfertaDeRevision(
  entrada: EntradaOferta
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso(PERMISOS_GESTION_OFERTAS)
  const validacion = esquemaOferta.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  return aplicar(actor, "retirarOfertaDeRevision", {
    entidad: "ofertas",
    id: validacion.data.ofertaId,
    hacia: "BORRADOR",
  })
}

/**
 * Cancela un borrador, una devuelta o una publicada (esta con motivo). Una
 * publicada con asignaciones que consumen cupo no se cancela: la BD lo
 * impide y su detalle lo explica.
 */
export async function cancelarOferta(
  entrada: EntradaCancelarOferta
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso(PERMISOS_GESTION_OFERTAS)
  const validacion = esquemaCancelarOferta.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  return aplicar(actor, "cancelarOferta", {
    entidad: "ofertas",
    id: validacion.data.ofertaId,
    hacia: "CANCELADA",
    motivo: validacion.data.motivo,
  })
}

/**
 * Archiva una oferta cancelada o terminada (`archivar_oferta_srv`): deja de
 * verse en la campaña y el equipo AMO conserva su historial. La BD revalida
 * actor, sesión, empresa y estado.
 */
export async function archivarOferta(
  entrada: EntradaOferta
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso(PERMISOS_GESTION_OFERTAS)
  const validacion = esquemaOferta.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const contexto = await contextoDelActor(actor)
    const { error } = await contexto.admin.rpc("archivar_oferta_srv", {
      p_oferta_id: validacion.data.ofertaId,
      p_actor_id: contexto.actorId,
      p_session_id: contexto.sessionId,
    })
    if (error) return falloBd("archivarOferta", error)
    return exito()
  } catch (error) {
    informar("archivarOferta", error)
    return fallo(MENSAJE_INESPERADO)
  }
}
