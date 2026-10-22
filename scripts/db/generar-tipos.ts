/**
 * `pnpm db:types`: regenera src/types/database.types.ts desde el proyecto remoto de Supabase.
 *
 * Ejecuta `supabase gen types typescript --project-id <ref> --schema public`, con el ref de
 * `NEXT_PUBLIC_SUPABASE_URL` del archivo de entorno (`.env.local`, o el que indique
 * `AMO_ARCHIVO_ENTORNO`). Desarrollo y producción tienen el mismo esquema. Requiere la CLI
 * autenticada: `supabase login` en local o SUPABASE_ACCESS_TOKEN (token personal) en CI. No usa
 * las claves de la aplicación. Alternativa sin CLI: la herramienta MCP `generate_typescript_types`,
 * pegando su salida debajo de la misma cabecera.
 *
 * `pnpm db:types local` los genera desde la pila de `supabase start` (útil para migraciones que aún no están
 * en ningún proyecto remoto; mismo generador, misma forma).
 */
import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"

import { supabaseUrlDe } from "../bootstrap/produccion"

function proyectoDelEntorno(): string {
  const archivo = process.env.AMO_ARCHIVO_ENTORNO ?? ".env.local"
  const url = supabaseUrlDe(archivo)
  const ref =
    url && URL.canParse(url)
      ? /^([a-z0-9]+)\.supabase\.co$/.exec(new URL(url).hostname)?.[1]
      : undefined
  if (!ref) {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL de ${archivo} no es la de un proyecto de Supabase en la nube.`
    )
  }
  return ref
}

const LOCAL = process.argv.slice(2).includes("local")
const PROYECTO = LOCAL ? "local" : proyectoDelEntorno()
const DESTINO = "src/types/database.types.ts"
const MIGRACIONES = "supabase/migrations"

function ultimaMigracion(): string {
  const archivos = readdirSync(MIGRACIONES)
    .filter((archivo) => archivo.endsWith(".sql"))
    .sort()
  return archivos.at(-1)?.replace(/\.sql$/, "") ?? "ninguna"
}

function cabecera(): string {
  const linea = `// ${"─".repeat(77)}`
  return [
    linea,
    "// ARCHIVO GENERADO — no editar a mano.",
    LOCAL
      ? "// Origen: Supabase local (supabase start), esquema public,"
      : `// Origen: Supabase generate_typescript_types (proyecto ${PROYECTO}, esquema public),`,
    `// última migración aplicada: ${ultimaMigracion()}.`,
    "// Regenerar con `pnpm db:types` (scripts/db/generar-tipos.ts; requiere `supabase login`).",
    linea,
    "",
  ].join("\n")
}

const tipos = execFileSync(
  "supabase",
  [
    "gen",
    "types",
    "typescript",
    ...(LOCAL ? ["--local"] : ["--project-id", PROYECTO]),
    "--schema",
    "public",
  ],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }
)
/**
 * La generación local omite `__InternalSupabase` (versión de PostgREST del proyecto remoto, que tipa el cliente):
 * se conserva la del archivo actual para que los tipos no cambien de forma según de dónde se generen.
 */
function conservarVersionPostgrest(generados: string): string {
  if (generados.includes("__InternalSupabase: {")) return generados
  const actual = existsSync(DESTINO) ? readFileSync(DESTINO, "utf8") : ""
  const bloque =
    /\n( {2}\/\/ Allows to automatically[^\n]*\n[^\n]*\n {2}__InternalSupabase: \{\n[^}]*\n {2}\}\n)/.exec(
      actual
    )?.[1]
  const apertura = "export type Database = {\n"
  return bloque ? generados.replace(apertura, apertura + bloque) : generados
}

writeFileSync(DESTINO, cabecera() + conservarVersionPostgrest(tipos))
console.log(`Tipos escritos en ${DESTINO}`)
