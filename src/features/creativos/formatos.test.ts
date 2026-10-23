import { describe, expect, it } from "vitest"

import { MIB } from "@/lib/archivos/formato"

import { FORMATOS_PRUEBA } from "./fixtures"
import {
  LIMITES_POR_DEFECTO,
  maximoArchivos,
  mimesDeTipo,
  minimoArchivos,
  nombreFormato,
  piezaDe,
  reglasCreativo,
  requisitosDeFormato,
  requisitosVisibles,
  tipoAdmitido,
  tipoInicial,
  tiposDeCreativo,
  topeBytes,
} from "./formatos"
import type { FormatoOferta } from "./tipos"

const ESPACIO = " "

describe("requisitosDeFormato", () => {
  it("lee el JSON de la BD con sus valores por defecto", () => {
    expect(FORMATOS_PRUEBA.reel.requisitos).toEqual({
      mime: ["video/mp4", "video/quicktime"],
      pesoMaxMb: 50,
      duracionMaxSeg: 90,
      relacionesAspecto: ["9:16"],
      maxArchivos: 1,
    })
    expect(FORMATOS_PRUEBA.carrusel.requisitos.maxArchivos).toBe(10)
  })

  it("tolera JSON vacío, de otro tipo o con valores inválidos", () => {
    expect(requisitosDeFormato(null)).toEqual({
      mime: [],
      pesoMaxMb: null,
      duracionMaxSeg: null,
      relacionesAspecto: [],
      maxArchivos: 1,
    })
    expect(
      requisitosDeFormato({
        mime: ["image/png", 3],
        peso_max_mb: "20",
        duracion_max_s: -1,
        max_archivos: 0,
      })
    ).toMatchObject({
      mime: ["image/png"],
      pesoMaxMb: 20,
      duracionMaxSeg: null,
      maxArchivos: 1,
    })
    expect(requisitosDeFormato([1, 2])).toMatchObject({ mime: [] })
  })
})

describe("nombres", () => {
  it("nombra el formato y la pieza con su plataforma", () => {
    expect(nombreFormato(FORMATOS_PRUEBA.reel)).toBe("Reel de Instagram")
    expect(piezaDe(FORMATOS_PRUEBA.reel)).toBe("Un reel de Instagram")
    expect(piezaDe(FORMATOS_PRUEBA.videoTiktok)).toBe("Un video de TikTok")
    expect(piezaDe({ ...FORMATOS_PRUEBA.reel, clave: "NUEVO" })).toBe(
      "Este formato"
    )
  })
})

describe("tipos de creativo", () => {
  it("el carrusel solo admite carrusel; los demás, según sus MIME", () => {
    expect(tiposDeCreativo(FORMATOS_PRUEBA.carrusel)).toEqual(["CARRUSEL"])
    expect(tiposDeCreativo(FORMATOS_PRUEBA.reel)).toEqual(["VIDEO"])
    expect(tiposDeCreativo(FORMATOS_PRUEBA.postFeed)).toEqual([
      "IMAGEN",
      "VIDEO",
    ])
    expect(tipoInicial(FORMATOS_PRUEBA.reel)).toBe("VIDEO")
    expect(tipoInicial(FORMATOS_PRUEBA.postFeed)).toBe("IMAGEN")
    expect(tipoAdmitido(FORMATOS_PRUEBA.reel, "IMAGEN")).toBe(false)
    expect(tipoAdmitido(FORMATOS_PRUEBA.postFeed, "CARRUSEL")).toBe(false)
  })

  it("filtra los MIME por tipo", () => {
    expect(mimesDeTipo(FORMATOS_PRUEBA.postFeed, "IMAGEN")).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
    ])
    expect(mimesDeTipo(FORMATOS_PRUEBA.postFeed, "VIDEO")).toEqual([
      "video/mp4",
    ])
    expect(mimesDeTipo(FORMATOS_PRUEBA.carrusel, "CARRUSEL")).toHaveLength(4)
  })

  it("cantidad mínima y máxima", () => {
    expect(minimoArchivos("CARRUSEL")).toBe(2)
    expect(minimoArchivos("VIDEO")).toBe(1)
    expect(maximoArchivos(FORMATOS_PRUEBA.carrusel)).toBe(10)
    expect(maximoArchivos(FORMATOS_PRUEBA.reel)).toBe(1)
  })
})

describe("topeBytes", () => {
  it("toma el menor entre formato, configuración y bucket", () => {
    expect(topeBytes(FORMATOS_PRUEBA.reel, LIMITES_POR_DEFECTO)).toBe(50 * MIB)
    expect(
      topeBytes(FORMATOS_PRUEBA.reel, {
        ...LIMITES_POR_DEFECTO,
        maxCreativoMb: 25,
      })
    ).toBe(25 * MIB)
    const liviano: FormatoOferta = {
      ...FORMATOS_PRUEBA.reel,
      requisitos: { ...FORMATOS_PRUEBA.reel.requisitos, pesoMaxMb: 8 },
    }
    expect(topeBytes(liviano, LIMITES_POR_DEFECTO)).toBe(8 * MIB)
  })
})

describe("reglasCreativo", () => {
  it("arma las reglas del reel con la pieza y medidas obligatorias", () => {
    expect(
      reglasCreativo(FORMATOS_PRUEBA.reel, "VIDEO", {
        maxCreativoMb: 25,
        toleranciaAspecto: 0.02,
      })
    ).toEqual({
      mimes: ["video/mp4", "video/quicktime"],
      maxBytes: 25 * MIB,
      aspecto: [{ relacion: 9 / 16, tolerancia: 0.02 }],
      duracionMaxSeg: 90,
      pieza: "Un reel de Instagram",
      medidasObligatorias: true,
    })
  })

  it("una imagen de post admite las tres proporciones y solo imágenes", () => {
    const reglas = reglasCreativo(
      FORMATOS_PRUEBA.postFeed,
      "IMAGEN",
      LIMITES_POR_DEFECTO
    )
    expect(reglas.mimes).toEqual(["image/jpeg", "image/png", "image/webp"])
    expect(reglas.aspecto).toHaveLength(3)
  })
})

describe("requisitosVisibles", () => {
  it("resume lo que pide el reel", () => {
    expect(
      requisitosVisibles(FORMATOS_PRUEBA.reel, "VIDEO", LIMITES_POR_DEFECTO)
    ).toEqual([
      {
        clave: "proporcion",
        texto: "Video vertical 9:16 (por ejemplo, 1080 × 1920 px)",
      },
      { clave: "formatos", texto: "MP4 o MOV" },
      { clave: "peso", texto: `Hasta 50${ESPACIO}MB por archivo` },
      {
        clave: "duracion",
        texto: `Videos de hasta 1${ESPACIO}min 30${ESPACIO}s`,
      },
      { clave: "cantidad", texto: "Un solo archivo" },
    ])
  })

  it("en imagen concuerda en femenino y no habla de duración", () => {
    const requisitos = requisitosVisibles(
      FORMATOS_PRUEBA.postFeed,
      "IMAGEN",
      LIMITES_POR_DEFECTO
    )
    expect(requisitos[0].texto).toBe(
      "Imagen cuadrada 1:1, vertical 4:5 u horizontal 1,91:1"
    )
    expect(requisitos.map((requisito) => requisito.clave)).not.toContain(
      "duracion"
    )
  })

  it("el carrusel pide de 2 a 10 piezas en orden", () => {
    const requisitos = requisitosVisibles(
      FORMATOS_PRUEBA.carrusel,
      "CARRUSEL",
      LIMITES_POR_DEFECTO
    )
    expect(requisitos[0].texto).toBe(
      "Imágenes o videos en proporción 1:1 o 4:5"
    )
    expect(requisitos.at(-1)?.texto).toBe(
      "De 2 a 10 archivos, en el orden en que se publican"
    )
  })
})
