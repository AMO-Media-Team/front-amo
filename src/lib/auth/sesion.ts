import "server-only"

import { obtenerAuthServidor } from "@/lib/supabase/auth-server"

import type { ClaimsSesion } from "./compuertas"
import { type EventoAcceso, registrarAcceso } from "./registro"

/**
 * Cierra la sesión de este navegador: revoca el refresh token en Auth y borra
 * las cookies (solo desde Server Actions o Route Handlers). Si ya estaba
 * revocada, Auth responde 401/404 y auth-js igualmente limpia las cookies.
 * Devuelve `false` si Auth no pudo cerrarla (p. ej. sin conexión).
 */
export async function cerrarSesionActual(
  claims: ClaimsSesion | null,
  evento: EventoAcceso | null
): Promise<boolean> {
  if (claims && evento) {
    await registrarAcceso({
      evento,
      usuarioId: claims.usuarioId,
      email: claims.email,
      sessionId: claims.sessionId,
      aal: claims.aal,
    })
  }
  const auth = await obtenerAuthServidor()
  const { error } = await auth.signOut({ scope: "local" })
  return !error
}
