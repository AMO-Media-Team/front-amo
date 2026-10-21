import { describe, expect, it } from "vitest"

import {
  aplicarFiltros,
  condicionesBusqueda,
  filtroCursor,
  filtrosVentana,
  lista,
  patronBusqueda,
} from "./filtros-postgrest"

describe("patronBusqueda", () => {
  it("envuelve en comodines y comillas", () => {
    expect(patronBusqueda("ana")).toBe('"*ana*"')
  })

  it("quita lo que tiene significado en PostgREST o LIKE (sin inyección de filtros)", () => {
    expect(patronBusqueda('a,b).or(id.eq.1"%*:;\\')).toBe('"*a b .or id.eq.1*"')
  })

  it("colapsa espacios, recorta y devuelve null si no queda nada", () => {
    expect(patronBusqueda("  ana   gómez ")).toBe('"*ana gómez*"')
    expect(patronBusqueda(" ,(); ")).toBeNull()
    expect(patronBusqueda("x".repeat(200))).toBe(`"*${"x".repeat(80)}*"`)
  })
})

describe("constructores", () => {
  it("lista y condiciones ilike", () => {
    expect(lista(["A", "B"])).toBe("(A,B)")
    expect(condicionesBusqueda(["ciudad", "navegador"], '"*x*"')).toEqual([
      'ciudad.ilike."*x*"',
      'navegador.ilike."*x*"',
    ])
  })

  it("ventana semiabierta sobre la columna de tiempo", () => {
    expect(
      filtrosVentana({
        desde: "2026-09-01T05:00:00.000Z",
        hastaExclusivo: "2026-10-01T05:00:00.000Z",
      })
    ).toEqual([
      {
        columna: "created_at",
        operador: "gte",
        valor: "2026-09-01T05:00:00.000Z",
      },
      {
        columna: "created_at",
        operador: "lt",
        valor: "2026-10-01T05:00:00.000Z",
      },
    ])
  })

  it("cursor keyset: más antiguo, o del mismo instante con id menor", () => {
    expect(filtroCursor({ at: "2026-09-30T22:30:00+00:00", id: 42 })).toEqual({
      o: 'created_at.lt."2026-09-30T22:30:00+00:00",and(created_at.eq."2026-09-30T22:30:00+00:00",id.lt.42)',
    })
  })
})

describe("aplicarFiltros", () => {
  it("encadena filter() y or() en orden (varios or se combinan con AND)", () => {
    const llamadas: string[] = []
    const consulta = {
      filter(columna: string, operador: string, valor: unknown) {
        llamadas.push(`filter ${columna} ${operador} ${String(valor)}`)
        return this
      },
      or(expresion: string) {
        llamadas.push(`or ${expresion}`)
        return this
      },
    }
    const resultado = aplicarFiltros(consulta, [
      { columna: "accion", operador: "in", valor: "(A,B)" },
      { o: "x.eq.1,y.eq.2" },
      { o: "z.is.null" },
    ])
    expect(resultado).toBe(consulta)
    expect(llamadas).toEqual([
      "filter accion in (A,B)",
      "or x.eq.1,y.eq.2",
      "or z.is.null",
    ])
  })
})
