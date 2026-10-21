import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  ErrorProduccion,
  esProduccion,
  exigirFueraDeProduccion,
  REF_PRODUCCION,
  supabaseUrlDe,
} from "./produccion"

const PRODUCCION = `https://${REF_PRODUCCION}.supabase.co`

describe("esProduccion", () => {
  it("reconoce el proyecto de producción con o sin ruta y mayúsculas", () => {
    expect(esProduccion(PRODUCCION)).toBe(true)
    expect(esProduccion(`${PRODUCCION}/`)).toBe(true)
    expect(esProduccion(PRODUCCION.toUpperCase())).toBe(true)
  })

  it("no confunde otros proyectos ni valores inválidos", () => {
    expect(esProduccion("https://zygfqfvqwfvhbirmjojp.supabase.co")).toBe(false)
    expect(esProduccion(`https://${REF_PRODUCCION}.supabase.co.otro.com`)).toBe(
      false
    )
    expect(esProduccion("http://127.0.0.1:54321")).toBe(false)
    expect(esProduccion(undefined)).toBe(false)
    expect(esProduccion("no es una url")).toBe(false)
  })
})

describe("exigirFueraDeProduccion", () => {
  it("bloquea la base de producción y deja pasar desarrollo", () => {
    expect(() => exigirFueraDeProduccion(PRODUCCION, "La suite E2E")).toThrow(
      ErrorProduccion
    )
    expect(() => exigirFueraDeProduccion(PRODUCCION, "La suite E2E")).toThrow(
      /La suite E2E no se ejecuta contra la base de producción/
    )
    expect(() =>
      exigirFueraDeProduccion(
        "https://zygfqfvqwfvhbirmjojp.supabase.co",
        "La suite E2E"
      )
    ).not.toThrow()
  })
})

describe("supabaseUrlDe", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function archivoCon(contenido: string): string {
    const ruta = join(mkdtempSync(join(tmpdir(), "amo-produccion-")), ".env")
    writeFileSync(ruta, contenido)
    return ruta
  }

  it("lee el archivo sin tocar process.env", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
    const ruta = archivoCon(`NEXT_PUBLIC_SUPABASE_URL=${PRODUCCION}\nOTRA=1\n`)
    expect(supabaseUrlDe(ruta)).toBe(PRODUCCION)
    expect(process.env.OTRA).toBeUndefined()
  })

  it("prefiere la variable del proceso, como Next", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://desarrollo.supabase.co")
    const ruta = archivoCon(`NEXT_PUBLIC_SUPABASE_URL=${PRODUCCION}\n`)
    expect(supabaseUrlDe(ruta)).toBe("https://desarrollo.supabase.co")
  })

  it("sin archivo ni variable no hay URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
    expect(supabaseUrlDe(join(tmpdir(), "no-existe-amo.env"))).toBeUndefined()
  })
})
