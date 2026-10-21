/**
 * `pnpm db:types`: regenera src/types/database.types.ts desde el proyecto remoto de Supabase.
 *
 * Ejecuta `supabase gen types typescript --project-id zygfqfvqwfvhbirmjojp --schema public`.
 * Requiere la CLI autenticada: `supabase login` en local o SUPABASE_ACCESS_TOKEN (token personal)
 * en CI. No usa las claves de la aplicación. Alternativa sin CLI: la herramienta MCP
 * `generate_typescript_types`, pegando su salida debajo de la misma cabecera.
 */
import { execFileSync } from "node:child_process"
import { readdirSync, writeFileSync } from "node:fs"

const PROYECTO = "zygfqfvqwfvhbirmjojp"
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
    `// Origen: Supabase generate_typescript_types (proyecto ${PROYECTO}, esquema public),`,
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
    "--project-id",
    PROYECTO,
    "--schema",
    "public",
  ],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }
)
writeFileSync(DESTINO, cabecera() + tipos)
console.log(`Tipos escritos en ${DESTINO}`)
