/**
 * `pnpm db:transiciones <develop|produccion>`: copia la máquina de estados de la BD
 * (`private.transiciones_estado`) a `src/lib/negocio/transiciones.generated.ts`, para que la interfaz ofrezca
 * solo las acciones que la BD aceptará (`src/lib/negocio/acciones.ts`).
 *
 * - Solo lee: una transacción `read only` con la conexión de `entorno-db.ts`; sirve contra producción.
 * - El módulo sale ordenado (entidad, origen, destino, actor) y formateado con Prettier: regenerarlo sin cambios
 *   en la tabla no produce diferencias.
 * - Si el archivo no compila tras regenerarlo, la BD, los tipos generados (`pnpm db:types`) o el catálogo de
 *   permisos se desalinearon: `TransicionEstado` ata cada estado al enum de su entidad.
 */
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import postgres from "postgres"
import { format, resolveConfig } from "prettier"

import { entornoDeArgumentos, redactar, urlDb } from "./entorno-db"

export const RUTA_TRANSICIONES = "src/lib/negocio/transiciones.generated.ts"

/** Fila tal como sale de la BD. */
export interface FilaTransicion {
  entidad: string
  desde: string
  hacia: string
  actor: string
  permiso: string | null
  requiere_motivo: boolean
  descripcion: string
}

function esTexto(valor: unknown): valor is string {
  return typeof valor === "string" && valor.length > 0
}

export function esFilaTransicion(fila: unknown): fila is FilaTransicion {
  if (typeof fila !== "object" || fila === null) return false
  const f = fila as Record<string, unknown>
  return (
    esTexto(f.entidad) &&
    esTexto(f.desde) &&
    esTexto(f.hacia) &&
    esTexto(f.actor) &&
    (f.permiso === null || esTexto(f.permiso)) &&
    typeof f.requiere_motivo === "boolean" &&
    esTexto(f.descripcion)
  )
}

function comparar(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

/** Orden estable por código de carácter (no depende de la intercalación de la base ni de la máquina). */
export function ordenarTransiciones(
  filas: readonly FilaTransicion[]
): FilaTransicion[] {
  return [...filas].sort(
    (a, b) =>
      comparar(a.entidad, b.entidad) ||
      comparar(a.desde, b.desde) ||
      comparar(a.hacia, b.hacia) ||
      comparar(a.actor, b.actor)
  )
}

/** Fuente del módulo (sin formatear). Falla si la tabla llega vacía o con filas inesperadas. */
export function generarModuloTransiciones(filas: readonly unknown[]): string {
  if (filas.length === 0) {
    throw new Error(
      "private.transiciones_estado llegó vacía: no se sobrescribe el módulo."
    )
  }
  const invalida = filas.findIndex((fila) => !esFilaTransicion(fila))
  if (invalida !== -1) {
    throw new Error(`La fila ${invalida + 1} no tiene la forma esperada.`)
  }
  const elementos = ordenarTransiciones(filas as FilaTransicion[]).map(
    (fila) =>
      `  ${JSON.stringify({
        entidad: fila.entidad,
        desde: fila.desde,
        hacia: fila.hacia,
        actor: fila.actor,
        permiso: fila.permiso,
        requiereMotivo: fila.requiere_motivo,
        descripcion: fila.descripcion,
      })},`
  )
  return [
    "/**",
    " * Máquina de estados de la BD (`private.transiciones_estado`) para la interfaz.",
    " * GENERADO por `pnpm db:transiciones <entorno>` (scripts/db/transiciones-ts.ts): no editar a mano.",
    ` * ${filas.length} transiciones, ordenadas por entidad, origen, destino y actor.`,
    " */",
    'import type { TransicionEstado } from "./tipos"',
    "",
    "export const TRANSICIONES: readonly TransicionEstado[] = [",
    ...elementos,
    "]",
    "",
  ].join("\n")
}

async function formatear(fuente: string): Promise<string> {
  const opciones = await resolveConfig(RUTA_TRANSICIONES)
  return format(fuente, { ...opciones, filepath: RUTA_TRANSICIONES })
}

async function leerTransiciones(url: string): Promise<unknown[]> {
  const sql = postgres(url, {
    ssl: "require",
    max: 1,
    prepare: false,
    idle_timeout: 5,
    onnotice: () => {},
    connection: { application_name: "amo-transiciones" },
  })
  try {
    const filas = await sql.begin(
      "read only",
      (tx) => tx`select entidad, desde, hacia, actor::text as actor, permiso,
                        requiere_motivo, descripcion
                   from private.transiciones_estado`
    )
    return filas.map((fila) => ({ ...fila }))
  } finally {
    await sql.end({ timeout: 5 })
  }
}

async function main(): Promise<void> {
  const entorno = entornoDeArgumentos(process.argv.slice(2))
  const url = urlDb(entorno)
  console.error(
    `→ leyendo private.transiciones_estado de ${entorno} (solo lectura)…`
  )
  try {
    const filas = await leerTransiciones(url)
    writeFileSync(
      RUTA_TRANSICIONES,
      await formatear(generarModuloTransiciones(filas))
    )
    console.log(
      `${filas.length} transiciones escritas en ${RUTA_TRANSICIONES}.`
    )
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error)
    throw new Error(redactar(mensaje, url))
  }
}

const esEjecucionDirecta =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (esEjecucionDirecta) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
