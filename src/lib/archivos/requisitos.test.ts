import { describe, expect, it } from "vitest"

import { MIB } from "./formato"
import {
  reglasAspectoDeTextos,
  reglasDesdeRequisitos,
  relacionDeTexto,
} from "./requisitos"

describe("relacionDeTexto", () => {
  it("lee proporciones enteras y decimales con punto o coma", () => {
    expect(relacionDeTexto("9:16")).toBeCloseTo(0.5625)
    expect(relacionDeTexto("1:1")).toBe(1)
    expect(relacionDeTexto("1.91:1")).toBeCloseTo(1.91)
    expect(relacionDeTexto(" 1,91 : 1 ")).toBeCloseTo(1.91)
  })

  it("descarta lo que no es una proporción", () => {
    expect(relacionDeTexto("")).toBeNull()
    expect(relacionDeTexto("16x9")).toBeNull()
    expect(relacionDeTexto("0:1")).toBeNull()
    expect(relacionDeTexto("9:0")).toBeNull()
    expect(relacionDeTexto("-1:2")).toBeNull()
  })
})

describe("reglasAspectoDeTextos", () => {
  it("convierte, omite las inválidas y no repite", () => {
    expect(reglasAspectoDeTextos(["1:1", "4:5", "x", "2:2"], 0.02)).toEqual([
      { relacion: 1, tolerancia: 0.02 },
      { relacion: 0.8, tolerancia: 0.02 },
    ])
  })
})

describe("reglasDesdeRequisitos", () => {
  const REEL = {
    mimes: ["video/mp4", "video/quicktime"],
    pesoMaxMb: 50,
    duracionMaxSeg: 90,
    relacionesAspecto: ["9:16"],
  }

  it("arma las reglas con el menor peso, las proporciones y la duración", () => {
    expect(
      reglasDesdeRequisitos(REEL, {
        topeBytes: 25 * MIB,
        tolerancia: 0.02,
        pieza: "Un reel",
        medidasObligatorias: true,
      })
    ).toEqual({
      mimes: ["video/mp4", "video/quicktime"],
      maxBytes: 25 * MIB,
      aspecto: [{ relacion: 9 / 16, tolerancia: 0.02 }],
      duracionMaxSeg: 90,
      pieza: "Un reel",
      medidasObligatorias: true,
    })
  })

  it("usa el peso propio si es menor que el tope y omite lo que no exige", () => {
    expect(
      reglasDesdeRequisitos(
        {
          mimes: ["image/png"],
          pesoMaxMb: 8,
          duracionMaxSeg: null,
          relacionesAspecto: [],
        },
        { topeBytes: 50 * MIB, tolerancia: 0.02 }
      )
    ).toEqual({ mimes: ["image/png"], maxBytes: 8 * MIB })
  })

  it("sin peso propio rige el tope global", () => {
    expect(
      reglasDesdeRequisitos(
        { ...REEL, pesoMaxMb: null },
        { topeBytes: 50 * MIB, tolerancia: 0.02 }
      ).maxBytes
    ).toBe(50 * MIB)
  })
})
