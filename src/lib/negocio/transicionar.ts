import "server-only"

import type { ContextoActor } from "@/lib/auth/contexto-actor"
import { argumentosRpc } from "@/lib/supabase/rpc"
import type { Json } from "@/types/database.types"

import type { EntidadTransicion, EstadoDe } from "./tipos"

export interface SolicitudTransicion<E extends EntidadTransicion> {
  entidad: E
  id: string
  hacia: EstadoDe<E>
  /** Obligatorio en las transiciones que lo exigen (`requiereMotivo`). */
  motivo?: string | null
  /** Datos de la transición en la lista blanca de la BD (nivel, vigencia, comentario…). */
  datos?: Json
}

/**
 * Cambio de estado por `transicionar_srv`, el único camino (AGENTS.md, regla 4).
 * Llamar solo desde una Server Action que ya pasó el DAL: la BD vuelve a validar
 * actor, sesión, permiso, propiedad, motivo y condiciones. Devuelve el error de
 * PostgREST tal cual para que la acción lo traduzca con `interpretarErrorBd`.
 */
export async function transicionar<E extends EntidadTransicion>(
  contexto: ContextoActor,
  { entidad, id, hacia, motivo = null, datos = {} }: SolicitudTransicion<E>
) {
  return contexto.admin.rpc(
    "transicionar_srv",
    argumentosRpc<"transicionar_srv">({
      p_entidad: entidad,
      p_id: id,
      p_hacia: hacia,
      p_actor_id: contexto.actorId,
      p_session_id: contexto.sessionId,
      p_motivo: motivo,
      p_datos: datos,
    })
  )
}
