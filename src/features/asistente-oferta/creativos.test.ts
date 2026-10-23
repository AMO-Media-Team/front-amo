import { describe, expect, it } from "vitest"

import {
  archivoPrueba,
  FORMATOS_PRUEBA,
  versionPrueba,
} from "@/features/creativos/fixtures"
import { FALTAS } from "@/features/creativos/paquete"

import { estadoCreativoInicial } from "./creativos"

const VIDEO = archivoPrueba()
const IMAGEN = archivoPrueba({ mime: "image/jpeg", duracionSegundos: null })

describe("estadoCreativoInicial", () => {
  it("sin versión falta el paquete, con el texto de la BD", () => {
    expect(estadoCreativoInicial([], FORMATOS_PRUEBA.reel)).toEqual({
      listo: false,
      archivos: 0,
      faltan: [FALTAS.sinArchivos],
    })
  })

  it("un reel con su video vigente está listo", () => {
    expect(
      estadoCreativoInicial(
        [versionPrueba({ archivos: [VIDEO] })],
        FORMATOS_PRUEBA.reel
      )
    ).toEqual({ listo: true, archivos: 1, faltan: [] })
  })

  it("tener archivos no basta: un carrusel con una sola pieza no está listo", () => {
    expect(
      estadoCreativoInicial(
        [versionPrueba({ tipo: "CARRUSEL", archivos: [IMAGEN] })],
        FORMATOS_PRUEBA.carrusel
      )
    ).toEqual({ listo: false, archivos: 1, faltan: [FALTAS.carrusel] })
  })

  it("solo cuenta la vigente (no una anterior sin vigencia)", () => {
    expect(
      estadoCreativoInicial(
        [
          versionPrueba({ version: 1, vigente: false, archivos: [VIDEO] }),
          versionPrueba({ version: 2, vigente: true, archivos: [] }),
        ],
        FORMATOS_PRUEBA.reel
      ).faltan
    ).toEqual([FALTAS.sinArchivos])
  })

  it("sin el formato en el catálogo, solo mira si hay archivos", () => {
    expect(
      estadoCreativoInicial([versionPrueba({ archivos: [VIDEO] })], undefined)
    ).toEqual({ listo: true, archivos: 1, faltan: [] })
    expect(estadoCreativoInicial([], undefined).faltan).toEqual([
      FALTAS.sinArchivos,
    ])
  })
})
