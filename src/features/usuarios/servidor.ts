import "server-only"

import type { ContextoActor } from "@/lib/auth/contexto-actor"
import { envCliente } from "@/lib/env"
import { fallo, type ResultadoFallo } from "@/lib/result"
import { argumentosRpc } from "@/lib/supabase/rpc"

import {
  codigoNegocio,
  esCorreoExistente,
  type ErrorAuth,
  type ErrorBd,
  MENSAJE_INESPERADO,
  mensajeErrorAuth,
  mensajeErrorBd,
} from "./errores"

/**
 * Utilidades de servidor de las acciones de Usuarios (no son acciones: no
 * llevan `"use server"`). Toda escritura privilegiada va con el contexto del
 * actor (`@/lib/auth/contexto-actor`: secret key + `x-amo-actor`), y la BD
 * revalida actor, sesión y permisos (§2.4.4).
 */

/** Origen público para los enlaces (nunca el `Host` de la solicitud). */
export const SITIO = envCliente.NEXT_PUBLIC_SITE_URL

/** Log de servidor sin datos personales: operación y código. */
export function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[usuarios] ${operacion} falló (${codigo})`)
}

/** Las reglas de negocio (`AMO_*`) son esperables y no se registran; lo demás sí. */
export function informarSiInesperado(operacion: string, error: ErrorBd): void {
  if (!codigoNegocio(error)) informar(operacion, error)
}

/** Error de la BD → resultado para la interfaz. */
export function falloBd(operacion: string, error: ErrorBd): ResultadoFallo {
  informarSiInesperado(operacion, error)
  return fallo(mensajeErrorBd(error))
}

export function falloAuth(operacion: string, error: ErrorAuth): ResultadoFallo {
  const mensaje = mensajeErrorAuth(error)
  if (esCorreoExistente(error)) return fallo(mensaje, { email: [mensaje] })
  informar(operacion, error)
  return fallo(mensaje)
}

export function falloInesperado(
  operacion: string,
  error: unknown
): ResultadoFallo {
  informar(operacion, error)
  return fallo(MENSAJE_INESPERADO)
}

type AccionAutorizable =
  "EDITAR" | "SUSPENDER" | "INVITAR" | "GENERAR_ENLACE" | "CERRAR_SESIONES"

/**
 * `autorizar_gestion_usuario_srv` (§5.4): permiso, sesión viva y
 * anti-escalada sobre el objetivo, ANTES de llamar a la Admin API de Auth
 * (que no pasa por los triggers guardianes). `null` si está autorizado.
 */
export async function autorizarGestion(
  contexto: ContextoActor,
  objetivoId: string | null,
  accion: AccionAutorizable
): Promise<ErrorBd | null> {
  const { error } = await contexto.admin.rpc(
    "autorizar_gestion_usuario_srv",
    argumentosRpc<"autorizar_gestion_usuario_srv">({
      p_actor_id: contexto.actorId,
      p_session_id: contexto.sessionId,
      p_objetivo: objetivoId,
      p_accion: accion,
    })
  )
  return error
}

/** Bloqueo en Auth mientras la cuenta está suspendida o desactivada (~100 años). */
export const BLOQUEO_INDEFINIDO = "876000h"
export const SIN_BLOQUEO = "none"
