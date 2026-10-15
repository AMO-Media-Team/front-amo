import { describe, expect, it } from "vitest"

import {
  adornoUnidad,
  borradorInicial,
  interpretarBorrador,
  textoRango,
} from "./edicion"
import type { ReglasParametro } from "./tipos"

const limpio = (texto: string | null) =>
  (texto ?? "").replace(/[\u00A0\u202F]/g, " ")

function reglas(
  tipo: ReglasParametro["tipo"],
  minimo: number | null = null,
  maximo: number | null = null,
  opciones: string[] | null = null
): ReglasParametro {
  return { clave: "prueba.clave", tipo, minimo, maximo, opciones }
}

describe("borradorInicial", () => {
  it("escribe cifras en es-CO y porcentajes de 0 a 100", () => {
    expect(borradorInicial(reglas("ENTERO"), 30000)).toEqual({
      tipo: "numero",
      texto: "30.000",
    })
    expect(borradorInicial(reglas("PORCENTAJE"), 0.155)).toEqual({
      tipo: "porcentaje",
      texto: "15,5",
    })
    expect(borradorInicial(reglas("DECIMAL"), null)).toEqual({
      tipo: "numero",
      texto: "",
    })
  })

  it("completa un mapa con todas sus opciones", () => {
    expect(
      borradorInicial(reglas("MAPA_DECIMAL", 1, 100, ["FACEBOOK", "TIKTOK"]), {
        FACEBOOK: 3,
      })
    ).toEqual({ tipo: "mapa", textos: { FACEBOOK: "3", TIKTOK: "" } })
  })
})

describe("interpretarBorrador", () => {
  it("convierte y valida con las reglas de la BD", () => {
    expect(
      interpretarBorrador(reglas("ENTERO", 1000, 1_000_000), {
        tipo: "numero",
        texto: "45.000",
      })
    ).toEqual({ ok: true, valor: 45000 })
    expect(
      interpretarBorrador(reglas("PORCENTAJE", 0, 0.5), {
        tipo: "porcentaje",
        texto: "22,5",
      })
    ).toEqual({ ok: true, valor: 0.225 })
  })

  it("explica el error sin llegar al servidor", () => {
    const fuera = interpretarBorrador(reglas("PORCENTAJE", 0, 0.5), {
      tipo: "porcentaje",
      texto: "60",
    })
    expect(fuera).toEqual({ ok: false, error: "Debe estar entre 0% y 50%." })
    expect(
      interpretarBorrador(reglas("ENTERO", 1, 10), {
        tipo: "numero",
        texto: "2,5",
      })
    ).toEqual({ ok: false, error: "Debe ser un número entero." })
    expect(
      interpretarBorrador(reglas("ENTERO"), { tipo: "numero", texto: "abc" })
    ).toEqual({ ok: false, error: "Escribe un número." })
  })

  it("exige al menos una opción y un valor por plataforma", () => {
    expect(
      interpretarBorrador(reglas("LISTA_TEXTO", null, null, ["H24", "D7"]), {
        tipo: "lista",
        valores: [],
      })
    ).toEqual({ ok: false, error: "Elige al menos una opción." })
    expect(
      interpretarBorrador(
        reglas("MAPA_DECIMAL", 1, 100, ["FACEBOOK", "TIKTOK"]),
        {
          tipo: "mapa",
          textos: { FACEBOOK: "3", TIKTOK: "" },
        }
      )
    ).toEqual({ ok: false, error: "Escribe un número en cada plataforma." })
    expect(
      interpretarBorrador(
        reglas("LISTA_TEXTO", null, null, ["H24", "H72", "D7"]),
        {
          tipo: "lista",
          valores: ["D7", "H24"],
        }
      )
    ).toEqual({ ok: true, valor: ["H24", "D7"] })
  })

  it("valida contra otra tabla cuando el parámetro lo requiere", () => {
    const existe = (iso2: string) => iso2 === "CO"
    expect(
      interpretarBorrador(
        reglas("LISTA_TEXTO"),
        { tipo: "lista", valores: ["CO", "ZZ"] },
        { existe }
      )
    ).toEqual({ ok: false, error: "Contiene valores que no existen." })
  })
})

describe("textoRango y adornoUnidad", () => {
  it("describe el rango con la unidad una sola vez", () => {
    expect(
      limpio(
        textoRango({ tipo: "ENTERO", minimo: 7, maximo: 365, unidad: "días" })
      )
    ).toBe("Entre 7 y 365 días")
    expect(
      limpio(
        textoRango({ tipo: "PORCENTAJE", minimo: 0, maximo: 0.5, unidad: "%" })
      )
    ).toBe("Entre 0% y 50%")
    expect(
      limpio(
        textoRango({ tipo: "ENTERO", minimo: 1, maximo: 1000, unidad: "COP" })
      )
    ).toBe("Entre $ 1 y $ 1.000")
    expect(
      textoRango({ tipo: "MAPA_DECIMAL", minimo: 1, maximo: 100, unidad: "×" })
    ).toBe("Cada valor: entre 1× y 100×")
    expect(
      textoRango({ tipo: "BOOLEANO", minimo: null, maximo: null, unidad: null })
    ).toBeNull()
  })

  it("elige prefijo o sufijo", () => {
    expect(adornoUnidad({ tipo: "PORCENTAJE", unidad: "%" })).toEqual({
      posicion: "fin",
      texto: "%",
    })
    expect(adornoUnidad({ tipo: "ENTERO", unidad: "COP" })).toEqual({
      posicion: "inicio",
      texto: "$",
    })
    expect(adornoUnidad({ tipo: "ENTERO", unidad: null })).toBeNull()
    expect(adornoUnidad({ tipo: "ENTERO", unidad: "días" })).toEqual({
      posicion: "fin",
      texto: "días",
    })
  })

  it("nombra el multiplicador: un «×» junto al campo parecería «borrar»", () => {
    expect(adornoUnidad({ tipo: "DECIMAL", unidad: "×" })).toEqual({
      posicion: "fin",
      texto: "veces",
    })
  })
})
