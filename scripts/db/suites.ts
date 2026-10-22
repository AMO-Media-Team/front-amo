/**
 * `pnpm db:suites <develop|produccion> [archivo.sql…] [--omitir archivo.sql…]`: ejecuta las suites SQL de
 * `supabase/tests/` (todas en `begin … rollback`; solo consumen secuencias) contra la base del entorno, una
 * conexión por suite y por protocolo simple. Una suite pasa si sus filas `pasan = total` y no reporta fallos.
 * Sin archivos, corre todas. Algunas dependen de datos: `humo_roles_permisos_aplicables` exige un
 * SUPERADMIN activo y `humo_bitacora_indice` mide el plan, que cambia con el volumen (ver su cabecera).
 */
import { readdirSync, readFileSync } from "node:fs"

import postgres from "postgres"

import { entornoDeArgumentos, redactar, sslDe, urlDb } from "./entorno-db"

const DIRECTORIO = "supabase/tests"

interface FilaResultado {
  pasan: number | string
  total: number | string
  fallan: Record<string, unknown> | null
}

function esFilaResultado(fila: unknown): fila is FilaResultado {
  return (
    typeof fila === "object" &&
    fila !== null &&
    "pasan" in fila &&
    "total" in fila
  )
}

function seleccionar(argumentos: readonly string[]): string[] {
  const indiceOmitir = argumentos.indexOf("--omitir")
  const pedidos = argumentos.slice(
    1,
    indiceOmitir === -1 ? undefined : indiceOmitir
  )
  const omitidos = new Set(
    indiceOmitir === -1 ? [] : argumentos.slice(indiceOmitir + 1)
  )
  const todos = readdirSync(DIRECTORIO)
    .filter((archivo) => archivo.endsWith(".sql"))
    .sort()
  const desconocidos = [...pedidos, ...omitidos].filter(
    (archivo) => !todos.includes(archivo)
  )
  if (desconocidos.length > 0)
    throw new Error(`Suites inexistentes: ${desconocidos.join(", ")}`)
  return (pedidos.length > 0 ? pedidos : todos).filter(
    (archivo) => !omitidos.has(archivo)
  )
}

async function correr(
  url: string,
  ssl: "require" | false,
  archivo: string
): Promise<boolean> {
  const sql = postgres(url, {
    ssl,
    max: 1,
    prepare: false,
    idle_timeout: 5,
    onnotice: () => {},
    connection: { application_name: "amo-suites" },
  })
  const inicio = performance.now()
  try {
    const resultados: unknown = await sql
      .unsafe(readFileSync(`${DIRECTORIO}/${archivo}`, "utf8"))
      .simple()
    const filas = [resultados].flat(2).filter(esFilaResultado)
    const pasan = filas.reduce((suma, fila) => suma + Number(fila.pasan), 0)
    const total = filas.reduce((suma, fila) => suma + Number(fila.total), 0)
    const fallas = filas
      .map((fila) => fila.fallan)
      .filter((fallan) => fallan && Object.keys(fallan).length > 0)
    const ok = filas.length > 0 && pasan === total && fallas.length === 0
    const segundos = ((performance.now() - inicio) / 1000).toFixed(1)
    console.log(
      `${ok ? "✓" : "✗"} ${archivo}: ${pasan}/${total} (${segundos} s)` +
        (fallas.length > 0
          ? ` fallan: ${JSON.stringify(fallas).slice(0, 2000)}`
          : "")
    )
    return ok
  } catch (error) {
    await sql
      .unsafe("rollback")
      .simple()
      .catch(() => {})
    const mensaje = error instanceof Error ? error.message : String(error)
    console.log(`✗ ${archivo}: ERROR ${redactar(mensaje, url).slice(0, 1000)}`)
    return false
  } finally {
    await sql.end({ timeout: 5 })
  }
}

async function main(): Promise<void> {
  const argumentos = process.argv.slice(2)
  const entorno = entornoDeArgumentos(argumentos)
  const url = urlDb(entorno)
  console.error(`→ suites SQL contra ${entorno}`)
  let todas = true
  for (const archivo of seleccionar(argumentos)) {
    todas = (await correr(url, sslDe(entorno), archivo)) && todas
  }
  console.log(todas ? "TODAS LAS SUITES PASAN" : "HAY SUITES CON FALLOS")
  if (!todas) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
