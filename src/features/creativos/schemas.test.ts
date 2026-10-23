import { describe, expect, it } from "vitest"

import { MIB } from "@/lib/archivos/formato"

import {
  esquemaConfirmarArchivo,
  esquemaCrearVersion,
  esquemaGuardarCreativo,
  esquemaOrdenarArchivos,
  esquemaPrepararArchivo,
  esquemaTextosCreativo,
  TEXTOS_VACIOS,
} from "./schemas"

const OFERTA = "01a16525-58de-707e-a365-2362638c6104"
const CREATIVO = "01a16525-58df-7261-945f-fdec04e83e70"

const VIDEO = {
  nombre: "reel.mp4",
  tipo: "video/mp4",
  tamano: 12 * MIB,
  sha256: "b".repeat(64),
  dimensiones: { ancho: 1080, alto: 1920 },
  duracionSeg: 30.5,
  conMiniatura: true,
}

describe("esquemaTextosCreativo", () => {
  it("normaliza: vacíos a null, prefijos, sin repetir y https agregado", () => {
    expect(
      esquemaTextosCreativo.parse({
        copySugerido: "  Hola  ",
        hashtags: ["Publicidad", "#publicidad", "#MiMarca"],
        menciones: ["mimarca"],
        enlaceDestino: "mimarca.co/promo",
      })
    ).toEqual({
      copySugerido: "Hola",
      hashtags: ["#Publicidad", "#MiMarca"],
      menciones: ["@mimarca"],
      enlaceDestino: "https://mimarca.co/promo",
    })
    expect(esquemaTextosCreativo.parse(TEXTOS_VACIOS)).toEqual({
      copySugerido: null,
      hashtags: [],
      menciones: [],
      enlaceDestino: null,
    })
  })

  it("rechaza con mensajes por campo", () => {
    const resultado = esquemaTextosCreativo.safeParse({
      copySugerido: "x".repeat(2201),
      hashtags: ["mi marca"],
      menciones: Array.from({ length: 21 }, (_, i) => `cuenta${i}`),
      enlaceDestino: "http://mimarca.co",
    })
    expect(resultado.success).toBe(false)
    const porCampo = Object.fromEntries(
      (resultado.error?.issues ?? []).map((issue) => [
        String(issue.path[0]),
        issue.message,
      ])
    )
    expect(porCampo.copySugerido).toMatch(/hasta 2\.200 caracteres/)
    expect(porCampo.hashtags).toMatch(/no es un hashtag válido/)
    expect(porCampo.menciones).toBe("Puedes agregar hasta 20 menciones.")
    expect(porCampo.enlaceDestino).toMatch(/https:\/\//)
  })
})

describe("esquemaGuardarCreativo", () => {
  it("exige oferta y tipo; los textos son opcionales", () => {
    expect(
      esquemaGuardarCreativo.safeParse({ ofertaId: OFERTA, tipo: "VIDEO" })
        .success
    ).toBe(true)
    expect(
      esquemaGuardarCreativo.safeParse({ ofertaId: "x", tipo: "OTRO" }).success
    ).toBe(false)
  })
})

describe("archivos", () => {
  it("acepta un video con huella, medidas y duración", () => {
    expect(
      esquemaPrepararArchivo.safeParse({
        ofertaId: OFERTA,
        creativoId: CREATIVO,
        archivo: VIDEO,
      }).success
    ).toBe(true)
  })

  it("exige huella, medidas y duración del video", () => {
    const resultado = esquemaPrepararArchivo.safeParse({
      ofertaId: OFERTA,
      creativoId: CREATIVO,
      archivo: { ...VIDEO, sha256: null, dimensiones: null, duracionSeg: null },
    })
    expect(resultado.error?.issues.map((issue) => issue.message)).toEqual([
      "Falta la huella SHA-256 del archivo. Elígelo de nuevo.",
      expect.stringMatching(/medidas del archivo/),
      expect.stringMatching(/duración del video/),
    ])
  })

  it("una imagen no necesita duración; nada fuera del bucket", () => {
    expect(
      esquemaPrepararArchivo.safeParse({
        ofertaId: OFERTA,
        creativoId: CREATIVO,
        archivo: {
          ...VIDEO,
          nombre: "a.png",
          tipo: "image/png",
          duracionSeg: null,
        },
      }).success
    ).toBe(true)
    expect(
      esquemaPrepararArchivo.safeParse({
        ofertaId: OFERTA,
        creativoId: CREATIVO,
        archivo: { ...VIDEO, tipo: "application/pdf" },
      }).success
    ).toBe(false)
    expect(
      esquemaPrepararArchivo.safeParse({
        ofertaId: OFERTA,
        creativoId: CREATIVO,
        archivo: { ...VIDEO, tamano: 51 * MIB },
      }).success
    ).toBe(false)
  })

  it("confirmar acota el orden y exige la ruta", () => {
    const base = {
      ofertaId: OFERTA,
      creativoId: CREATIVO,
      archivo: {
        ...VIDEO,
        bucket: "creativos",
        ruta: `oferta/${OFERTA}/${CREATIVO}/x.mp4`,
        rutaMiniatura: null,
      },
    }
    expect(
      esquemaConfirmarArchivo.safeParse({ ...base, orden: 3 }).success
    ).toBe(true)
    expect(
      esquemaConfirmarArchivo.safeParse({ ...base, orden: 51 }).success
    ).toBe(false)
  })

  it("ordenar no admite repetidos", () => {
    expect(
      esquemaOrdenarArchivos.safeParse({
        creativoId: CREATIVO,
        ids: [OFERTA, OFERTA],
      }).error?.issues[0].message
    ).toBe("La lista repite un archivo.")
  })
})

describe("esquemaCrearVersion", () => {
  it("exige decidir si se conserva la vigente", () => {
    expect(
      esquemaCrearVersion.safeParse({ ofertaId: OFERTA, conservar: true })
        .success
    ).toBe(true)
    expect(esquemaCrearVersion.safeParse({ ofertaId: OFERTA }).success).toBe(
      false
    )
  })
})
