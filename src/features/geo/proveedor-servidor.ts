import "server-only"

import { crearProveedorSupabase } from "./proveedor-supabase"
import type { ProveedorMetricasGeo } from "./tipos"

type Entorno = Readonly<Record<string, string | undefined>>

/**
 * Datos simulados solo con `AMO_GEO_MOCK=1` en desarrollo o pruebas: nunca en
 * un build de producción (`next start`, Vercel production), aunque la variable
 * exista.
 */
export function usarDatosSimulados(entorno: Entorno = process.env): boolean {
  return (
    entorno.AMO_GEO_MOCK === "1" &&
    entorno.NODE_ENV !== "production" &&
    entorno.VERCEL_ENV !== "production"
  )
}

/** Latencia simulada para ver los estados de carga (`AMO_GEO_MOCK_LATENCIA_MS`). */
function latenciaSimulada(entorno: Entorno): number {
  const valor = Number(entorno.AMO_GEO_MOCK_LATENCIA_MS ?? 0)
  return Number.isFinite(valor) ? Math.min(Math.max(valor, 0), 5000) : 0
}

/**
 * Proveedor de la solicitud. El simulado se importa de forma dinámica y tras
 * la comprobación de `NODE_ENV` (que Next sustituye al compilar): en
 * producción esa rama es código muerto y el módulo no se carga.
 */
export async function obtenerProveedorGeo(
  entorno: Entorno = process.env
): Promise<ProveedorMetricasGeo> {
  if (process.env.NODE_ENV !== "production" && usarDatosSimulados(entorno)) {
    const { crearProveedorSimulado } = await import("./proveedor-simulado")
    return crearProveedorSimulado({ latenciaMs: latenciaSimulada(entorno) })
  }
  return crearProveedorSupabase()
}
