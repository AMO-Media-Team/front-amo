"use server"

/**
 * Server Actions de la moderación de ofertas (ADM-005): publicar, devolver
 * con comentario, rechazar con motivo y cancelar una publicada. Patrón:
 *
 * 1. DAL (`requerirPermiso("ofertas.moderar")`) antes que nada.
 * 2. zod: el MISMO esquema que el diálogo.
 * 3. El cambio de estado va por `transicionar` (`transicionar_srv` con actor y
 *    sesión): la BD revalida permiso, estado, fecha límite, creativo,
 *    presupuesto y asignaciones; deja historial, bitácora y los avisos al
 *    anunciante y a los medios elegibles.
 * 4. Rechazar y cancelar llegan al mismo estado (CANCELADA) desde orígenes
 *    distintos: se comprueba el origen para que un clic sobre una vista
 *    desactualizada no cancele una oferta que ya cambió.
 * 5. Publicar, devolver y rechazar mandan el `enviada_at` que mostraba la
 *    ficha: si el anunciante reenvió la oferta mientras se revisaba, la BD
 *    la rechaza (hint `oferta_reenviada`), se refresca la ficha y se explica.
 * 6. `refresh()` para que la ficha y la cola muestren el cambio.
 *
 * Los errores esperados se devuelven como `ResultadoAccion`; nunca se lanzan.
 */
import "server-only"

import { refresh } from "next/cache"

import { interpretarErrorOferta } from "@/features/ofertas/errores"
import { ESTADOS_OFERTA } from "@/features/operacion/estados"
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
import { crearClienteServidor } from "@/lib/supabase/server"

import {
  type Decision,
  HINT_OFERTA_REENVIADA,
  MENSAJE_OFERTA_REENVIADA,
  ORIGEN_DECISION,
} from "./decision"
import {
  type EntradaCancelacion,
  type EntradaDecision,
  type EntradaDecisionConMotivo,
  esquemaCancelacion,
  esquemaDecision,
  esquemaDecisionConMotivo,
} from "./schemas"

/** Log de servidor sin datos personales: operación y código. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[moderacion] ${operacion} falló (${codigo})`)
}

function falloBd(operacion: string, error: ErrorBd): ResultadoFallo {
  const { mensaje, campo, esperado } = interpretarErrorOferta(error)
  if (!esperado) informar(operacion, error)
  return campo ? fallo(mensaje, { [campo]: [mensaje] }) : fallo(mensaje)
}

/**
 * La oferta sigue en el estado del que parte la decisión (leída con la
 * sesión: su RLS prueba el acceso). Devuelve el fallo a mostrar si no.
 */
async function comprobarOrigen(
  ofertaId: string,
  decision: Decision
): Promise<ResultadoFallo | null> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from("ofertas")
    .select("estado")
    .eq("id", ofertaId)
    .maybeSingle()
  if (error) throw error
  if (!data) {
    return fallo(
      "No encontramos la oferta o ya no tienes acceso a ella. Actualiza la página."
    )
  }
  const origen = ORIGEN_DECISION[decision]
  if (data.estado === origen) return null
  return fallo(
    `La oferta ya no está «${ESTADOS_OFERTA[origen].etiqueta.toLocaleLowerCase("es-CO")}»: ahora está «${ESTADOS_OFERTA[data.estado].etiqueta.toLocaleLowerCase("es-CO")}». Actualiza la página para ver su estado actual.`
  )
}

async function decidir(
  actor: UsuarioSesion,
  operacion: string,
  solicitud: SolicitudTransicion<"ofertas">,
  verificarOrigen?: Decision
): Promise<ResultadoAccion> {
  try {
    if (verificarOrigen) {
      const desfase = await comprobarOrigen(solicitud.id, verificarOrigen)
      if (desfase) return desfase
    }
    const contexto = await contextoDelActor(actor)
    const { error } = await transicionar(contexto, solicitud)
    if (error?.hint === HINT_OFERTA_REENVIADA) {
      // La ficha pasa a mostrar el envío nuevo; el diálogo explica por qué no se decidió.
      refresh()
      return fallo(MENSAJE_OFERTA_REENVIADA)
    }
    if (error) return falloBd(operacion, error)
    refresh()
    return exito()
  } catch (error) {
    informar(operacion, error)
    return fallo(MENSAJE_INESPERADO)
  }
}

/** Publica la oferta: la ven los medios elegibles, que reciben el aviso. */
export async function publicarOferta(
  entrada: EntradaDecision
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("ofertas.moderar")
  const validacion = esquemaDecision.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { ofertaId, enviadaAt } = validacion.data
  return decidir(actor, "publicarOferta", {
    entidad: "ofertas",
    id: ofertaId,
    hacia: "PUBLICADA",
    datos: { enviada_at: enviadaAt },
  })
}

/** Devuelve la oferta al anunciante con un comentario de lo que debe ajustar. */
export async function devolverOferta(
  entrada: EntradaDecisionConMotivo
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("ofertas.moderar")
  const validacion = esquemaDecisionConMotivo.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { ofertaId, enviadaAt, motivo } = validacion.data
  return decidir(actor, "devolverOferta", {
    entidad: "ofertas",
    id: ofertaId,
    hacia: "DEVUELTA",
    motivo,
    datos: { enviada_at: enviadaAt },
  })
}

/**
 * Rechaza la oferta en revisión. El motivo queda también como comentario de
 * moderación: es el que recibe el anunciante en el aviso de rechazo, aunque
 * la oferta traiga el comentario de una devolución anterior.
 */
export async function rechazarOferta(
  entrada: EntradaDecisionConMotivo
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("ofertas.moderar")
  const validacion = esquemaDecisionConMotivo.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { ofertaId, enviadaAt, motivo } = validacion.data
  return decidir(
    actor,
    "rechazarOferta",
    {
      entidad: "ofertas",
      id: ofertaId,
      hacia: "CANCELADA",
      motivo,
      datos: { comentario_moderacion: motivo, enviada_at: enviadaAt },
    },
    "rechazar"
  )
}

/** Cancela una oferta publicada sin asignaciones que consuman cupo. */
export async function cancelarOfertaPublicada(
  entrada: EntradaCancelacion
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("ofertas.moderar")
  const validacion = esquemaCancelacion.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  return decidir(
    actor,
    "cancelarOfertaPublicada",
    {
      entidad: "ofertas",
      id: validacion.data.ofertaId,
      hacia: "CANCELADA",
      motivo: validacion.data.motivo,
    },
    "cancelar"
  )
}
