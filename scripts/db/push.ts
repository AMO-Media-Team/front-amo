/**
 * `pnpm db:push <develop|produccion> [--dry-run] [--confirmar-produccion]`: aplica las migraciones
 * pendientes de `supabase/migrations/` con `supabase db push --db-url` (Session pooler como `postgres.<ref>`).
 *
 * - Primero en develop y después en producción; producción exige `--confirmar-produccion` salvo en
 *   `--dry-run`, que solo lista lo pendiente.
 * - Sin shell (`execFile`) y con la salida redactada: la URL lleva la contraseña de la base.
 * - Nunca `--linked` (entra como `cli_login_*`) ni la herramienta MCP `apply_migration` (otra numeración).
 */
import { execFile } from "node:child_process"

import {
  entornoDeArgumentos,
  ErrorEntornoDb,
  redactar,
  urlDb,
} from "./entorno-db"

const argumentos = process.argv.slice(2)
const simulacion = argumentos.includes("--dry-run")

function main(): void {
  const entorno = entornoDeArgumentos(argumentos)
  if (
    entorno === "produccion" &&
    !simulacion &&
    !argumentos.includes("--confirmar-produccion")
  ) {
    throw new ErrorEntornoDb(
      "Aplicar migraciones en producción exige --confirmar-produccion (prueba antes con --dry-run y en develop)."
    )
  }
  const url = urlDb(entorno)
  const args = [
    "db",
    "push",
    "--db-url",
    url,
    "--skip-vault",
    ...(simulacion ? ["--dry-run"] : ["--yes"]),
  ]
  console.error(
    `→ supabase db push contra ${entorno}${simulacion ? " (simulación)" : ""}…`
  )
  execFile(
    "supabase",
    args,
    { maxBuffer: 64 * 1024 * 1024, timeout: 30 * 60 * 1000 },
    (error, stdout, stderr) => {
      if (stdout) process.stdout.write(redactar(stdout, url))
      if (stderr) process.stderr.write(redactar(stderr, url))
      if (error) {
        console.error(
          "supabase db push terminó con error:",
          redactar(error.message, url).slice(0, 2000)
        )
        process.exitCode = 1
      }
    }
  )
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
