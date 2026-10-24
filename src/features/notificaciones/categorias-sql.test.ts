// @vitest-environment node
/**
 * Paridad entre las categorías de la interfaz (`CATEGORIAS`) y su copia en la
 * base (`private.categoria_notificacion`, migración del cierre), que decide
 * qué correos silencia cada persona. Si se agrega un prefijo en un lado y no
 * en el otro, una preferencia de correo dejaría de cumplirse.
 */
import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { CATEGORIAS_CORREO_OBLIGATORIAS } from "@/features/cuenta/preferencias"

import { CATEGORIAS, CLAVES_CATEGORIA, categoriaDe } from "./presentacion"

const MIGRACION = new URL(
  "../../../supabase/migrations/20261024181218_e3_cierre.sql",
  import.meta.url
)

const sql = readFileSync(MIGRACION, "utf8")

function cuerpoDe(funcion: string): string {
  const inicio = sql.indexOf(`create function private.${funcion}(`)
  expect(inicio, `no se encontró private.${funcion}`).toBeGreaterThan(-1)
  const fin = sql.indexOf("$$;", inicio)
  return sql.slice(inicio, fin)
}

/** `when 'oferta' then 'ofertas'` → { oferta: "ofertas" } */
function correspondenciaSql(): Record<string, string> {
  const cuerpo = cuerpoDe("categoria_notificacion")
  const pares = [...cuerpo.matchAll(/when\s+'([a-z_]+)'\s+then\s+'([a-z_]+)'/g)]
  return Object.fromEntries(pares.map(([, prefijo, clave]) => [prefijo, clave]))
}

function correspondenciaTs(): Record<string, string> {
  return Object.fromEntries(
    CLAVES_CATEGORIA.flatMap((clave) =>
      CATEGORIAS[clave].prefijos.map((prefijo) => [prefijo, clave])
    )
  )
}

describe("private.categoria_notificacion ↔ CATEGORIAS", () => {
  it("asigna cada prefijo a la misma categoría", () => {
    const enSql = correspondenciaSql()
    expect(Object.keys(enSql).length).toBeGreaterThan(0)
    expect(enSql).toEqual(correspondenciaTs())
  })

  it("lo que no reconoce cae en «otras» en ambos lados", () => {
    expect(cuerpoDe("categoria_notificacion")).toMatch(/else\s+'otras'/)
    expect(categoriaDe("desconocido.algo")).toBe("otras")
  })

  it("seguridad y privacidad nunca se silencian, igual que en Preferencias", () => {
    const cuerpo = cuerpoDe("correo_silenciado")
    const lista = /not in \(([^)]*)\)/.exec(cuerpo)?.[1] ?? ""
    const obligatorias = [...lista.matchAll(/'([a-z_]+)'/g)].map(
      ([, clave]) => clave
    )
    expect(obligatorias.toSorted()).toEqual(
      [...CATEGORIAS_CORREO_OBLIGATORIAS].toSorted()
    )
    expect(cuerpo).toContain("preferencias -> 'correo' -> 'silenciadas'")
  })
})
