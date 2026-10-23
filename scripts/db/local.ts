/**
 * `pnpm db:local [--sin-demo]`: reconstruye desde cero la base de la pila local (`supabase start`) para
 * desarrollar y correr las suites y los E2E sin tocar ningún proyecto en la nube:
 *
 * 1. `supabase db reset --local`: todas las migraciones y la semilla geo.
 * 2. Secreto de Vault (`pnpm db:vault local`) con el `AMO_SERVIDOR_SECRET` de `.env.local`.
 * 3. Superadministrador ACTIVO (`SUPERADMIN_EMAIL`): `bootstrap:superadmin` crea la cuenta y, como en local no
 *    hay correo que confirmar, aquí se marca confirmado y se vuelve a ejecutar para activarla (el enlace que
 *    imprime no se muestra). SOLO en local.
 * 4. Datos demo (salvo `--sin-demo`): cuentas (`demo:generar usuarios`), definiciones `supabase/seed/demo/0*.sql`
 *    y pasos (`demo:generar pasos`) ejecutados como `postgres`.
 * 5. Cuentas E2E (`bootstrap:e2e`).
 *
 * El reset borra los factores TOTP de Auth, así que antes se quitan de `.env.local` los secretos TOTP de las
 * cuentas demo y E2E (los scripts los vuelven a enrolar y agregar). Se niega a correr si `.env.local` no apunta a
 * la pila local.
 */
import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import postgres from "postgres"

import { supabaseUrlDe } from "../bootstrap/produccion"
import { URL_DB_LOCAL } from "./entorno-db"

const ARCHIVO_ENV = ".env.local"
const DEMO = "supabase/seed/demo"
const TOTP_A_REENROLAR =
  /^(?:DEMO_(?:ADMIN|OPERACIONES|FINANZAS)|E2E_[A-Z_]+)_TOTP_SECRET=.*$/gm

function exigirPilaLocal(): void {
  const url = supabaseUrlDe(ARCHIVO_ENV)
  const host = url && URL.canParse(url) ? new URL(url).hostname : ""
  if (!["127.0.0.1", "localhost"].includes(host)) {
    throw new Error(
      `${ARCHIVO_ENV} no apunta a la pila local (NEXT_PUBLIC_SUPABASE_URL): db:local solo reconstruye la base de Docker.`
    )
  }
}

/** Ejecuta un comando sin shell; la salida solo se muestra si falla (puede llevar enlaces de un solo uso). */
function correr(paso: string, comando: string, argumentos: string[]): void {
  console.log(`→ ${paso}`)
  try {
    execFileSync(comando, argumentos, { stdio: "pipe", encoding: "utf8" })
  } catch (error) {
    const salida = error as { stdout?: string; stderr?: string }
    const texto = `${salida.stdout ?? ""}${salida.stderr ?? ""}`
      .split("\n")
      .filter((linea) => !linea.includes("token_hash"))
      .slice(-15)
      .join("\n")
    throw new Error(`${paso} falló:\n${texto}`)
  }
}

function quitarTotpDelEntorno(): void {
  const actual = readFileSync(ARCHIVO_ENV, "utf8")
  const limpio = actual.replace(TOTP_A_REENROLAR, "").replace(/\n{3,}/g, "\n\n")
  if (limpio !== actual) writeFileSync(ARCHIVO_ENV, limpio)
}

async function ejecutarSql(sql: postgres.Sql, archivo: string): Promise<void> {
  try {
    await sql.unsafe(readFileSync(archivo, "utf8"))
  } catch (error) {
    const { message, detail } = error as { message?: string; detail?: string }
    throw new Error(
      `${archivo}: ${message ?? error}${detail ? ` (${detail})` : ""}`
    )
  }
}

async function main(): Promise<void> {
  const conDemo = !process.argv.includes("--sin-demo")
  exigirPilaLocal()

  correr("migraciones (supabase db reset --local)", "supabase", [
    "db",
    "reset",
    "--local",
  ])
  correr("secreto de Vault", "pnpm", ["db:vault", "local"])

  const sql = postgres(URL_DB_LOCAL, {
    ssl: false,
    max: 1,
    prepare: false,
    onnotice: () => {},
  })
  try {
    correr("superadministrador", "pnpm", ["bootstrap:superadmin"])
    await sql`
      update auth.users u set email_confirmed_at = now()
      from public.perfiles p join public.roles r on r.id = p.rol_id
      where p.id = u.id and r.clave = 'SUPERADMIN' and u.email_confirmed_at is null`
    correr("activar superadministrador", "pnpm", ["bootstrap:superadmin"])

    quitarTotpDelEntorno()
    if (conDemo) {
      correr("cuentas demo", "pnpm", ["demo:generar", "usuarios"])
      correr("pasos demo", "pnpm", ["demo:generar", "pasos"])
      const definiciones = readdirSync(DEMO)
        .filter((archivo) => /^0\d.*\.sql$/.test(archivo))
        .sort()
        .map((archivo) => join(DEMO, archivo))
      const pasos = readdirSync(join(DEMO, "pasos"))
        .filter((archivo) => archivo.endsWith(".sql"))
        .sort()
        .map((archivo) => join(DEMO, "pasos", archivo))
      console.log(
        `→ datos demo (${definiciones.length + pasos.length} archivos SQL)`
      )
      for (const archivo of [...definiciones, ...pasos]) {
        await ejecutarSql(sql, archivo)
      }
      // Estadísticas recién cargadas: sin ellas el planificador no usa los
      // índices que comprueba `humo_bitacora_indice.sql`.
      await sql`analyze`
    }
  } finally {
    await sql.end()
  }
  correr("cuentas E2E", "pnpm", ["bootstrap:e2e"])
  console.log(`Base local lista${conDemo ? " con datos demo" : ""}.`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
