import { describe, expect, it } from "vitest"

import type { ColumnaReporte } from "./columnas"
import {
  aplicarEstadoTabla,
  compararValores,
  type EstadoTablaMemoria,
  estadoEnMemoria,
  type FacetaReporte,
  filtrarFilas,
  normalizarTexto,
  opcionesFaceta,
  ordenarFilas,
  paginarFilas,
} from "./tabla"

interface Fila {
  id: string
  ciudad: string
  zona: string | null
  gmv: number | null
  mes: string
}

const FILAS: readonly Fila[] = [
  { id: "a", ciudad: "Bogotá", zona: "Centro", gmv: 300, mes: "2026-03" },
  { id: "b", ciudad: "Medellín", zona: "Andina", gmv: null, mes: "2026-01" },
  { id: "c", ciudad: "Cali", zona: "Pacífico", gmv: 120, mes: "2026-02" },
  { id: "d", ciudad: "Ñíquira", zona: null, gmv: 120, mes: "2026-10" },
  { id: "e", ciudad: "Barranquilla", zona: "Caribe", gmv: 90, mes: "2026-09" },
]

const COLUMNAS: readonly ColumnaReporte<Fila>[] = [
  {
    id: "ciudad",
    titulo: "Ciudad",
    tipo: "texto",
    valor: (f) => f.ciudad,
    buscable: true,
  },
  { id: "zona", titulo: "Zona", tipo: "texto", valor: (f) => f.zona },
  { id: "gmv", titulo: "GMV", tipo: "cop", valor: (f) => f.gmv },
  {
    id: "mes",
    titulo: "Mes",
    tipo: "texto",
    valor: (f) => `mes ${f.mes.slice(5)}`,
    valorOrden: (f) => f.mes,
  },
]

const FACETAS: readonly FacetaReporte<Fila>[] = [
  { clave: "zona", titulo: "Zona", valor: (f) => f.zona },
]

const estado = (
  parcial: Partial<EstadoTablaMemoria> = {}
): EstadoTablaMemoria => ({
  q: "",
  pagina: 1,
  tamano: 20,
  orden: { campo: "ciudad", descendente: false },
  facetas: {},
  ...parcial,
})

const ids = (filas: readonly Fila[]) => filas.map((f) => f.id).join("")

describe("normalizarTexto", () => {
  it("ignora mayúsculas, tildes y espacios sobrantes", () => {
    expect(normalizarTexto("  BOGOTÁ ")).toBe("bogota")
    expect(normalizarTexto("Ñíquira")).toBe("niquira")
  })
})

describe("filtrarFilas", () => {
  it("busca sin tildes y solo en las columnas buscables", () => {
    expect(
      ids(filtrarFilas(FILAS, COLUMNAS, FACETAS, estado({ q: "bogota" })))
    ).toBe("a")
    expect(
      ids(filtrarFilas(FILAS, COLUMNAS, FACETAS, estado({ q: "LL" })))
    ).toBe("be")
    // «Caribe» está en una columna que no entra en la búsqueda.
    expect(
      filtrarFilas(FILAS, COLUMNAS, FACETAS, estado({ q: "caribe" }))
    ).toEqual([])
  })

  it("combina la búsqueda con las facetas; una fila sin valor no pasa la faceta", () => {
    const filtro = estado({ facetas: { zona: ["Centro", "Caribe"] } })
    expect(ids(filtrarFilas(FILAS, COLUMNAS, FACETAS, filtro))).toBe("ae")
    expect(
      ids(filtrarFilas(FILAS, COLUMNAS, FACETAS, { ...filtro, q: "barr" }))
    ).toBe("e")
    expect(
      ids(
        filtrarFilas(
          FILAS,
          COLUMNAS,
          FACETAS,
          estado({ facetas: { zona: [] } })
        )
      )
    ).toBe("abcde")
  })
})

describe("compararValores y ordenarFilas", () => {
  it("los vacíos van al final en ambas direcciones", () => {
    expect(compararValores(null, 5, false)).toBeGreaterThan(0)
    expect(compararValores(null, 5, true)).toBeGreaterThan(0)
    expect(compararValores("", "a", true)).toBeGreaterThan(0)
    expect(compararValores(null, null, false)).toBe(0)
  })

  it("ordena números, textos en español y booleanos", () => {
    expect(compararValores(2, 10, false)).toBeLessThan(0)
    expect(compararValores(2, 10, true)).toBeGreaterThan(0)
    expect(compararValores("Ñíquira", "Zipaquirá", false)).toBeLessThan(0)
    expect(compararValores("medio 2", "medio 10", false)).toBeLessThan(0)
    expect(compararValores(false, true, false)).toBeLessThan(0)
  })

  it("el orden es estable: los empates conservan el orden de la consulta", () => {
    const asc = ordenarFilas(FILAS, COLUMNAS, {
      campo: "gmv",
      descendente: false,
    })
    expect(ids(asc)).toBe("ecdab")
    const desc = ordenarFilas(FILAS, COLUMNAS, {
      campo: "gmv",
      descendente: true,
    })
    expect(ids(desc)).toBe("acdeb")
  })

  it("usa la clave de orden cuando difiere de lo que se muestra", () => {
    const porMes = ordenarFilas(FILAS, COLUMNAS, {
      campo: "mes",
      descendente: false,
    })
    expect(porMes.map((f) => f.mes)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-09",
      "2026-10",
    ])
  })

  it("un campo desconocido deja las filas como llegaron", () => {
    const igual = ordenarFilas(FILAS, COLUMNAS, {
      campo: "otro",
      descendente: true,
    })
    expect(ids(igual)).toBe("abcde")
    expect(igual).not.toBe(FILAS)
  })
})

describe("paginarFilas", () => {
  it("recorta la página pedida", () => {
    expect(ids(paginarFilas(FILAS, 1, 2))).toBe("ab")
    expect(ids(paginarFilas(FILAS, 3, 2))).toBe("e")
  })

  it("una página que ya no existe cae en la última; una inválida, en la primera", () => {
    expect(ids(paginarFilas(FILAS, 9, 2))).toBe("e")
    expect(ids(paginarFilas(FILAS, 0, 2))).toBe("ab")
    expect(paginarFilas([], 4, 20)).toEqual([])
  })
})

describe("aplicarEstadoTabla", () => {
  it("filtra, ordena y pagina; el total cuenta todas las páginas", () => {
    const pagina = aplicarEstadoTabla(
      FILAS,
      COLUMNAS,
      FACETAS,
      estado({
        tamano: 2,
        pagina: 2,
        orden: { campo: "gmv", descendente: true },
      })
    )
    expect(ids(pagina.filas)).toBe("de")
    expect(pagina.total).toBe(5)
  })

  it("no modifica las filas de origen", () => {
    const copia = [...FILAS]
    aplicarEstadoTabla(FILAS, COLUMNAS, FACETAS, estado({ q: "a" }))
    expect(FILAS).toEqual(copia)
  })
})

describe("opcionesFaceta", () => {
  it("ofrece solo los valores presentes, en orden alfabético", () => {
    expect(opcionesFaceta(FILAS, FACETAS[0])).toEqual([
      { valor: "Andina", etiqueta: "Andina" },
      { valor: "Caribe", etiqueta: "Caribe" },
      { valor: "Centro", etiqueta: "Centro" },
      { valor: "Pacífico", etiqueta: "Pacífico" },
    ])
  })

  it("respeta el orden fijo y las etiquetas de la faceta", () => {
    const faceta: FacetaReporte<Fila> = {
      clave: "tamano",
      titulo: "Tamaño",
      valor: (f) => ((f.gmv ?? 0) >= 120 ? "grande" : "chico"),
      etiqueta: (valor) => valor.toUpperCase(),
      orden: ["grande", "mediano", "chico"],
    }
    expect(opcionesFaceta(FILAS, faceta)).toEqual([
      { valor: "grande", etiqueta: "GRANDE" },
      { valor: "chico", etiqueta: "CHICO" },
    ])
  })
})

describe("estadoEnMemoria", () => {
  it("toma las facetas declaradas e ignora lo demás", () => {
    const resultado = estadoEnMemoria(
      {
        q: "cali",
        pagina: 2,
        tamano: 50,
        orden: { campo: "gmv", descendente: true },
        zona: ["Centro"],
        intruso: ["x"],
        mora: "no-es-lista",
      },
      ["zona", "mora"]
    )
    expect(resultado).toEqual({
      q: "cali",
      pagina: 2,
      tamano: 50,
      orden: { campo: "gmv", descendente: true },
      facetas: { zona: ["Centro"], mora: [] },
    })
  })
})
