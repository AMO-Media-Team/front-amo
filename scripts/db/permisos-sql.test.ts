// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  CLAVES_PERMISO,
  CLAVES_ROL_SISTEMA,
  PERMISOS,
  ROLES_SISTEMA,
} from "../../src/lib/auth/permisos"
import { generarSqlPermisos, RUTA_SEMILLA_PERMISOS } from "./permisos-sql"

const DIR_MIGRACIONES = join(process.cwd(), "supabase/migrations")

function migraciones(): { nombre: string; sql: string }[] {
  return readdirSync(DIR_MIGRACIONES)
    .filter((archivo) => archivo.endsWith(".sql"))
    .sort()
    .map((nombre) => ({
      nombre,
      sql: readFileSync(join(DIR_MIGRACIONES, nombre), "utf8"),
    }))
}

/** Cuerpo de la semilla sin las líneas de comentario de cabecera del generador. */
function cuerpoSemilla(sql: string): string {
  return sql
    .split("\n")
    .filter((linea) => !linea.startsWith("--"))
    .join("\n")
    .trim()
}

describe("semilla de permisos", () => {
  const sql = generarSqlPermisos()

  it("está al día con el catálogo (ejecuta pnpm db:permisos si falla)", () => {
    const enDisco = readFileSync(
      join(process.cwd(), RUTA_SEMILLA_PERMISOS),
      "utf8"
    )
    expect(enDisco).toBe(sql)
  })

  it("la última migración que siembra permisos contiene la semilla vigente (si falla, crea una migración nueva)", () => {
    const conSemilla = migraciones().filter((m) =>
      m.sql.includes("insert into public.permisos")
    )
    expect(conSemilla.length).toBeGreaterThan(0)
    expect(conSemilla.at(-1)?.sql).toContain(cuerpoSemilla(sql))
  })

  it("identidad_rbac siembra los roles de sistema de ROLES_SISTEMA", () => {
    const m3 = migraciones().find((m) =>
      m.nombre.endsWith("_identidad_rbac.sql")
    )
    expect(m3).toBeDefined()
    for (const clave of CLAVES_ROL_SISTEMA) {
      const { nombre, descripcion, tipo, requiereMfa, color } =
        ROLES_SISTEMA[clave]
      expect(m3?.sql).toContain(
        `('${clave}', '${nombre}', '${descripcion}', '${tipo}', true, ${requiereMfa}, '${color}')`
      )
    }
  })

  it("inserta cada permiso una vez con su orden de catálogo", () => {
    CLAVES_PERMISO.forEach((clave, indice) => {
      const fila = `('${clave}', '${PERMISOS[clave].modulo}', `
      expect(sql.split(fila)).toHaveLength(2)
      expect(sql).toContain(`${PERMISOS[clave].esSensible}, ${indice + 1})`)
    })
  })

  it("siembra un par rol-permiso por cada rol por defecto", () => {
    const pares = CLAVES_PERMISO.reduce(
      (total, clave) => total + PERMISOS[clave].rolesPorDefecto.length,
      0
    )
    const filasPares = sql.match(/^ {2}\('[A-Z]+', '[a-z_.]+'\)/gm) ?? []
    expect(filasPares).toHaveLength(pares)
  })

  it("es idempotente y solo toca roles de sistema", () => {
    expect(sql).toContain("on conflict (clave) do update set")
    expect(sql).toContain("on conflict (rol_id, permiso_clave) do nothing;")
    expect(sql).toContain("r.es_sistema")
  })
})
