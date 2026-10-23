/**
 * `pnpm db:respaldo <local|develop|produccion> [--etiqueta <texto>]`: copia de esquema y de datos con
 * `supabase db dump --db-url` antes de aplicar migraciones (en producción no hay restauración a un punto en el
 * tiempo en el plan gratuito).
 *
 * - Escribe `context/respaldos/<entorno>-<fecha>[-<etiqueta>]-{esquema,datos}.sql` con permisos 0600 (`context/` no se
 *   versiona: los datos tienen información personal).
 * - Sin shell (`execFile`) y con la salida redactada: la URL lleva la contraseña de la base.
 * - Solo lee la base.
 */
import { execFile } from "node:child_process"
import { chmodSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { promisify } from "node:util"

import {
  entornoDeArgumentos,
  ErrorEntornoDb,
  redactar,
  urlDb,
} from "./entorno-db"

const ejecutar = promisify(execFile)
const CARPETA = join("context", "respaldos")
const ETIQUETA_VALIDA = /^[a-z0-9-]{1,40}$/
/** `en-CA` escribe la fecha como AAAA-MM-DD. */
const DIA_BOGOTA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
})

export function nombreRespaldo(
  entorno: string,
  fecha: Date,
  etiqueta: string | null,
  parte: "esquema" | "datos"
): string {
  // Día de Bogotá (AGENTS.md, regla 8): un respaldo de las 9 p. m. no queda con la fecha de mañana.
  const dia = DIA_BOGOTA.format(fecha)
  return `${entorno}-${dia}${etiqueta ? `-${etiqueta}` : ""}-${parte}.sql`
}

export function etiquetaDeArgumentos(
  argumentos: readonly string[]
): string | null {
  const indice = argumentos.indexOf("--etiqueta")
  if (indice === -1) return null
  const valor = argumentos[indice + 1]
  if (!valor || !ETIQUETA_VALIDA.test(valor)) {
    throw new ErrorEntornoDb(
      "--etiqueta lleva minúsculas, números o guiones (p. ej. antes-e2d)."
    )
  }
  return valor
}

async function volcar(
  url: string,
  destino: string,
  soloDatos: boolean
): Promise<void> {
  const args = [
    "db",
    "dump",
    "--db-url",
    url,
    "-f",
    destino,
    ...(soloDatos ? ["--data-only"] : []),
  ]
  try {
    await ejecutar("supabase", args, {
      maxBuffer: 64 * 1024 * 1024,
      timeout: 15 * 60 * 1000,
    })
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error)
    throw new ErrorEntornoDb(
      `supabase db dump falló: ${redactar(mensaje, url).slice(0, 2000)}`
    )
  }
  chmodSync(destino, 0o600)
}

async function main(): Promise<void> {
  const argumentos = process.argv.slice(2)
  const entorno = entornoDeArgumentos(argumentos)
  const etiqueta = etiquetaDeArgumentos(argumentos)
  const url = urlDb(entorno)
  mkdirSync(CARPETA, { recursive: true, mode: 0o700 })
  const ahora = new Date()
  for (const parte of ["esquema", "datos"] as const) {
    const destino = join(
      CARPETA,
      nombreRespaldo(entorno, ahora, etiqueta, parte)
    )
    console.error(`→ ${parte} de ${entorno} en ${destino}…`)
    await volcar(url, destino, parte === "datos")
  }
  console.error("Respaldo listo (0600, fuera de git).")
}

if (process.argv[1]?.endsWith("respaldo.ts")) {
  main().catch((error: unknown) => {
    const mensaje = error instanceof Error ? error.message : String(error)
    console.error(`db:respaldo falló: ${mensaje}`)
    process.exitCode = 1
  })
}
