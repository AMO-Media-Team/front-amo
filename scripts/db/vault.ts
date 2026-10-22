/**
 * `pnpm db:vault <develop|produccion> [--reemplazar]`: deja en Supabase Vault el secreto
 * `amo_servidor_secret` con el valor de `AMO_SERVIDOR_SECRET` del archivo de la app de ese entorno
 * (`.env.local` para develop, `.env.produccion` para producción) y comprueba
 * `private.contexto_confiable()` con la cabecera correcta, una incorrecta y sin cabecera (ADR-05). Si el
 * secreto existe con otro valor, solo lo cambia con `--reemplazar`. Nunca imprime el valor.
 */
import { readFileSync } from "node:fs"
import { parseEnv } from "node:util"

import postgres from "postgres"

import {
  type EntornoDb,
  entornoDeArgumentos,
  redactar,
  sslDe,
  urlDb,
} from "./entorno-db"

const ARCHIVO_APP: Record<EntornoDb, string> = {
  local: ".env.local",
  develop: ".env.local",
  produccion: ".env.produccion",
}
const NOMBRE = "amo_servidor_secret"
const DESCRIPCION =
  "Secreto compartido servidor Next <-> BD (cabecera x-amo-srv); docs/modelo-datos.md 2.5"

type Sql = postgres.Sql

async function contextoConfiable(
  sql: Sql,
  cabeceras: Record<string, string> | null
) {
  let valor: boolean | null = null
  await sql
    .begin(async (tx) => {
      if (cabeceras) {
        await tx`select set_config('request.headers', ${JSON.stringify(cabeceras)}, true)`
      }
      const [fila] = await tx<
        { v: boolean }[]
      >`select private.contexto_confiable() as v`
      valor = fila.v
      // La función guarda el resultado por transacción: cada caso revierte la suya.
      throw new Error("__revertir__")
    })
    .catch((error: unknown) => {
      if (!(error instanceof Error && error.message === "__revertir__"))
        throw error
    })
  return valor
}

async function main(): Promise<void> {
  const argumentos = process.argv.slice(2)
  const entorno = entornoDeArgumentos(argumentos)
  const secreto = parseEnv(
    readFileSync(ARCHIVO_APP[entorno], "utf8")
  ).AMO_SERVIDOR_SECRET
  if (!secreto || secreto.length < 32) {
    throw new Error(
      `AMO_SERVIDOR_SECRET falta o es corto en ${ARCHIVO_APP[entorno]}.`
    )
  }
  const url = urlDb(entorno)
  const sql = postgres(url, {
    ssl: sslDe(entorno),
    max: 1,
    prepare: false,
    onnotice: () => {},
  })
  try {
    const existentes = await sql<{ id: string; coincide: boolean }[]>`
      select id, decrypted_secret = ${secreto} as coincide
      from vault.decrypted_secrets where name = ${NOMBRE}`
    if (existentes.length === 0) {
      await sql`select vault.create_secret(${secreto}, ${NOMBRE}, ${DESCRIPCION})`
      console.log(`${NOMBRE}: creado`)
    } else if (existentes.length > 1) {
      throw new Error(
        `Hay ${existentes.length} secretos ${NOMBRE}: deja uno solo desde el panel.`
      )
    } else if (existentes[0].coincide) {
      console.log(`${NOMBRE}: ya coincide con ${ARCHIVO_APP[entorno]}`)
    } else if (argumentos.includes("--reemplazar")) {
      await sql`select vault.update_secret(${existentes[0].id}::uuid, ${secreto})`
      console.log(`${NOMBRE}: reemplazado`)
    } else {
      throw new Error(
        `${NOMBRE} existe con otro valor: usa --reemplazar si ${ARCHIVO_APP[entorno]} es el correcto.`
      )
    }
    const casos = {
      correcta: await contextoConfiable(sql, { "x-amo-srv": secreto }),
      incorrecta: await contextoConfiable(sql, { "x-amo-srv": "x".repeat(64) }),
      sinCabecera: await contextoConfiable(sql, null),
    }
    const ok =
      casos.correcta === true &&
      casos.incorrecta === false &&
      casos.sinCabecera === false
    console.log(
      `contexto_confiable: ${JSON.stringify(casos)} → ${ok ? "OK" : "FALLA"}`
    )
    if (!ok) process.exitCode = 1
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error)
    console.error(redactar(mensaje, url).split(secreto).join("«redactado»"))
    process.exitCode = 1
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
