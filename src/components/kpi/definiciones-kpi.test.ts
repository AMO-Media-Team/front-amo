// @vitest-environment node
import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  CLAVES_KPIS_ADMIN,
  CLAVES_KPIS_ANUNCIANTE,
  CLAVES_KPIS_MEDIO,
  CLAVES_METRICAS_ACCESOS,
  DEFINICIONES_KPI,
  definicionKpi,
} from "./definiciones-kpi"
import { propsDesdeFila } from "./desde-fila"
import type { FilaKpi } from "./tipos"

const MODELO = readFileSync(
  path.resolve(__dirname, "../../../docs/modelo-datos.md"),
  "utf8"
)

/** Palabras de la celda de salida que no son claves de KPI. */
const NO_CLAVES = new Set(["setof", "kpi_fila", "con", "kpi"])

/** Identificadores de la celda «Salida» de la RPC en docs/modelo-datos.md §5.9. */
function clavesDocumentadas(funcion: string): string[] {
  const fila = MODELO.split("\n").find((linea) =>
    linea.startsWith(`| \`${funcion}(`)
  )
  expect(fila, `fila de ${funcion} en el modelo`).toBeDefined()
  const salida = fila?.split("|").at(-2) ?? ""
  return [...salida.matchAll(/[a-z][a-z0-9_]*/g)]
    .map((m) => m[0])
    .filter((palabra) => !NO_CLAVES.has(palabra))
}

describe("diccionario de KPI", () => {
  it.each([
    ["kpis_admin", CLAVES_KPIS_ADMIN],
    ["metricas_accesos", CLAVES_METRICAS_ACCESOS],
  ] as const)("cubre exactamente las claves de %s", (funcion, claves) => {
    expect(new Set(clavesDocumentadas(funcion))).toEqual(new Set(claves))
  })

  it.each([
    ["kpis_anunciante", CLAVES_KPIS_ANUNCIANTE],
    ["kpis_medio", CLAVES_KPIS_MEDIO],
  ] as const)("define todas las claves de %s", (funcion, claves) => {
    const documentadas = clavesDocumentadas(funcion)
    for (const clave of claves) expect(documentadas).toContain(clave)
  })

  it("cada definición está completa y en español llano", () => {
    for (const [clave, definicion] of Object.entries(DEFINICIONES_KPI)) {
      expect(definicion.nombre, clave).not.toBe("")
      expect(definicion.definicion.endsWith("."), clave).toBe(true)
      expect(definicion.calculo, clave).not.toMatch(/select|sum\(|count\(/i)
    }
  })

  it("las tasas agregadas exigen muestra mínima; los conteos no", () => {
    expect(definicionKpi("tasa_cumplimiento")?.exigeMuestra).toBe(true)
    expect(definicionKpi("take_rate")?.exigeMuestra).toBe(true)
    expect(definicionKpi("gmv_verificado")?.exigeMuestra).toBeUndefined()
    expect(definicionKpi("no_existe")).toBeUndefined()
    expect(definicionKpi("toString")).toBeUndefined()
  })
})

describe("propsDesdeFila", () => {
  const fila: FilaKpi = {
    kpi: "tasa_cumplimiento",
    valor: null,
    valor_anterior: 0.9,
    variacion: null,
    n: 7,
    unidad: "%",
    serie: [0.9, 0.88],
  }

  it("completa nombre, sentido, definición y mínimo de muestra", () => {
    expect(propsDesdeFila(fila, 20)).toMatchObject({
      titulo: "Tasa de cumplimiento",
      unidad: "%",
      sentido: "mayor",
      n: 7,
      nMinimo: 20,
      valorAnterior: 0.9,
    })
  })

  it("una clave desconocida se muestra tal cual, neutra y sin mínimo", () => {
    const props = propsDesdeFila(
      { ...fila, kpi: "otra_cosa", unidad: "raro" },
      20
    )
    expect(props).toMatchObject({
      titulo: "otra_cosa",
      unidad: "conteo",
      sentido: "neutro",
    })
    expect(props.nMinimo).toBeUndefined()
  })

  it("respeta la unidad que devuelve la RPC", () => {
    expect(
      propsDesdeFila({ ...fila, kpi: "gmv_verificado", unidad: "COP" }, 20)
    ).toMatchObject({
      unidad: "COP",
      nMinimo: undefined,
    })
  })
})
