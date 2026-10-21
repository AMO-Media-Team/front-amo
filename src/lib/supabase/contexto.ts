import "server-only"

import { headers } from "next/headers"
import { cache } from "react"

import { getEnvServidor } from "@/lib/env.server"

import {
  construirCabecerasContexto,
  type ContextoSolicitud,
  extraerContextoSolicitud,
} from "./contexto-solicitud"

export type { ContextoSolicitud } from "./contexto-solicitud"

/** IP, ubicación aproximada y navegador del usuario (una lectura por solicitud). */
export const obtenerContextoSolicitud = cache(
  async (): Promise<ContextoSolicitud> =>
    extraerContextoSolicitud(await headers())
)

/**
 * Cabeceras `x-amo-*` para los clientes de Supabase del servidor (§2.5 del
 * modelo de datos). Nunca deben llegar al navegador: llevan el secreto
 * compartido con Postgres.
 */
export async function obtenerCabecerasContexto(
  actorId?: string | null
): Promise<Record<string, string>> {
  const contexto = await obtenerContextoSolicitud()
  return construirCabecerasContexto(contexto, {
    secreto: getEnvServidor().AMO_SERVIDOR_SECRET,
    actorId,
  })
}
