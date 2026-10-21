/**
 * Desglose de los eventos de sesión del periodo (módulo puro): verificaciones
 * en dos pasos, cierres, revocaciones, suspensiones y cambios de contraseña.
 * Complementa los indicadores de ingreso con lo que pasa después de entrar.
 */
import type { EventoAcceso } from "./catalogo"

export const EVENTOS_SESION = [
  "MFA_EXITOSO",
  "MFA_FALLIDO",
  "CONTRASENA_CAMBIADA",
  "RECUPERACION_SOLICITADA",
  "CIERRE_SESION",
  "SESION_EXPIRADA",
  "SESION_REVOCADA",
  "USUARIO_SUSPENDIDO",
] as const satisfies readonly EventoAcceso[]

export type EventoSesion = (typeof EVENTOS_SESION)[number]

export interface ConteoEvento {
  evento: EventoSesion
  cantidad: number
}

/** Cantidad de cada evento de sesión, en el orden de `EVENTOS_SESION` (incluye ceros). */
export function desgloseEventos(
  eventos: readonly EventoAcceso[]
): ConteoEvento[] {
  const conteos = new Map<EventoAcceso, number>()
  for (const evento of eventos)
    conteos.set(evento, (conteos.get(evento) ?? 0) + 1)
  return EVENTOS_SESION.map((evento) => ({
    evento,
    cantidad: conteos.get(evento) ?? 0,
  }))
}
