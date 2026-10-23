import { describe, expect, it } from "vitest"

import { FORMATOS_PRUEBA } from "./fixtures"
import { evaluarPaquete, FALTAS, mensajeMaximo, mismoEstado } from "./paquete"

const VIDEO = { mime: "video/mp4" }
const IMAGEN = { mime: "image/jpeg" }

describe("evaluarPaquete", () => {
  it("sin versión o sin archivos falta al menos uno (mismo texto que la BD)", () => {
    expect(
      evaluarPaquete({
        formato: FORMATOS_PRUEBA.reel,
        tipo: null,
        archivos: [],
      })
    ).toEqual({ listo: false, archivos: 0, faltan: [FALTAS.sinArchivos] })
  })

  it("un reel con su video está listo", () => {
    expect(
      evaluarPaquete({
        formato: FORMATOS_PRUEBA.reel,
        tipo: "VIDEO",
        archivos: [VIDEO],
        textos: "guardados",
      })
    ).toEqual({ listo: true, archivos: 1, faltan: [] })
  })

  it("un carrusel necesita dos piezas y no más de su máximo", () => {
    expect(
      evaluarPaquete({
        formato: FORMATOS_PRUEBA.carrusel,
        tipo: "CARRUSEL",
        archivos: [IMAGEN],
      }).faltan
    ).toEqual([FALTAS.carrusel])
    expect(
      evaluarPaquete({
        formato: FORMATOS_PRUEBA.carrusel,
        tipo: "CARRUSEL",
        archivos: Array.from({ length: 11 }, () => IMAGEN),
      }).faltan
    ).toEqual([mensajeMaximo(10)])
  })

  it("el tipo corresponde al formato y a los archivos", () => {
    expect(
      evaluarPaquete({
        formato: FORMATOS_PRUEBA.postFeed,
        tipo: "CARRUSEL",
        archivos: [IMAGEN],
      }).faltan
    ).toEqual([FALTAS.tipoFormato])
    expect(
      evaluarPaquete({
        formato: FORMATOS_PRUEBA.postFeed,
        tipo: "IMAGEN",
        archivos: [VIDEO],
      }).faltan
    ).toEqual([FALTAS.tipoArchivos])
  })

  it("en un formato solo de video el creativo es un video (como la BD)", () => {
    expect(
      evaluarPaquete({
        formato: FORMATOS_PRUEBA.reel,
        tipo: "IMAGEN",
        archivos: [IMAGEN],
      }).faltan
    ).toEqual([FALTAS.tipoFormato])
    expect(
      evaluarPaquete({
        formato: FORMATOS_PRUEBA.carrusel,
        tipo: "IMAGEN",
        archivos: [IMAGEN, IMAGEN],
      }).faltan
    ).toEqual([FALTAS.tipoFormato])
  })

  it("suma lo que solo sabe el navegador", () => {
    const estado = evaluarPaquete({
      formato: FORMATOS_PRUEBA.reel,
      tipo: "VIDEO",
      archivos: [],
      subidasEnCurso: 1,
      subidasConError: 1,
      textos: "invalidos",
    })
    // Mientras sube, no se pide «al menos un archivo».
    expect(estado.faltan).toEqual([
      FALTAS.subiendo,
      FALTAS.subidasFallidas,
      FALTAS.textosInvalidos,
    ])
    expect(
      evaluarPaquete({
        formato: FORMATOS_PRUEBA.reel,
        tipo: "VIDEO",
        archivos: [VIDEO],
        textos: "guardando",
      }).faltan
    ).toEqual([FALTAS.textosPendientes])
  })

  it("mensajeMaximo en singular y plural", () => {
    expect(mensajeMaximo(1)).toBe("Este formato admite un solo archivo.")
    expect(mensajeMaximo(10)).toBe("Este formato admite hasta 10 archivos.")
  })
})

describe("mismoEstado", () => {
  it("compara listo, cantidad y faltas en orden", () => {
    const base = { listo: false, archivos: 0, faltan: ["a", "b"] }
    expect(mismoEstado(base, { ...base, faltan: ["a", "b"] })).toBe(true)
    expect(mismoEstado(base, { ...base, faltan: ["b", "a"] })).toBe(false)
    expect(mismoEstado(base, { ...base, archivos: 1 })).toBe(false)
  })
})
