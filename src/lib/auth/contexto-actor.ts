import "server-only"

import { crearClienteAdmin } from "@/lib/supabase/admin"

import { obtenerClaims } from "./dal"
import type { UsuarioSesion } from "./tipos"

export type ClienteAdmin = Awaited<ReturnType<typeof crearClienteAdmin>>

/**
 * Lo que necesita una Server Action para llamar a un procedimiento `*_srv`
 * (solo `service_role`): quién actúa, con qué sesión y el cliente de servicio
 * que lleva su identidad (`x-amo-actor`) y el contexto confiable.
 */
export interface ContextoActor {
  actorId: string
  /** `session_id` del JWT: los `*_srv` validan que la sesión siga viva. */
  sessionId: string
  admin: ClienteAdmin
}

/**
 * Actor, sesión y cliente admin para una acción YA autorizada por el DAL
 * (`requerirPermiso` / `requerirUsuario`). Los claims vienen cacheados de la
 * misma solicitud. La BD vuelve a validar actor, permiso y sesión.
 */
export async function contextoDelActor(
  actor: UsuarioSesion
): Promise<ContextoActor> {
  const claims = await obtenerClaims()
  if (!claims || claims.usuarioId !== actor.id) {
    throw new Error("La sesión del actor no está disponible.")
  }
  return {
    actorId: actor.id,
    sessionId: claims.sessionId,
    admin: await crearClienteAdmin({ actorId: actor.id }),
  }
}
