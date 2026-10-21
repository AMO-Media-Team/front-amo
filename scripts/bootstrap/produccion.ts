/**
 * Guarda de producción para todo lo que crea datos de prueba o demo (cuentas
 * E2E y de pista, carrera de cupos, `pnpm demo:*`, pruebas de guardas por
 * PostgREST) y para la suite E2E: nada de eso escribe en la base de
 * producción, sin opción de forzarlo. `bootstrap:superadmin` y
 * `bootstrap:restablecer-mfa` no la usan: son legítimos en producción.
 *
 * Módulo autónomo (sin Supabase ni Next) para que `playwright.config.ts` lo
 * use antes de compilar la app.
 */
import { existsSync, readFileSync } from "node:fs"
import { parseEnv } from "node:util"

/** Proyecto de Supabase de producción (ca-central-1). Su URL es pública: no es un secreto. */
export const REF_PRODUCCION = "oriuuuaczpncmtglfgpv"

export class ErrorProduccion extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "ErrorProduccion"
  }
}

export function esProduccion(supabaseUrl: string | undefined): boolean {
  if (!supabaseUrl || !URL.canParse(supabaseUrl)) return false
  return (
    new URL(supabaseUrl).hostname.toLowerCase() ===
    `${REF_PRODUCCION}.supabase.co`
  )
}

/** Lanza si `supabaseUrl` es la de producción; `uso` dice qué se intentaba. */
export function exigirFueraDeProduccion(
  supabaseUrl: string | undefined,
  uso: string
): void {
  if (esProduccion(supabaseUrl)) {
    throw new ErrorProduccion(
      `${uso} no se ejecuta contra la base de producción (${REF_PRODUCCION}): crea datos de prueba. Apunta .env.local al proyecto de desarrollo.`
    )
  }
}

/**
 * `NEXT_PUBLIC_SUPABASE_URL` efectiva: la del entorno del proceso (gana, como
 * en Next) o la de `archivo`. No modifica `process.env`.
 */
export function supabaseUrlDe(archivo = ".env.local"): string | undefined {
  const delProceso = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (delProceso) return delProceso
  if (!existsSync(archivo)) return undefined
  return parseEnv(readFileSync(archivo, "utf8")).NEXT_PUBLIC_SUPABASE_URL
}
