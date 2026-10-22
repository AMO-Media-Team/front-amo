import { describe, expect, it } from "vitest"

import { MIB } from "./formato"
import {
  endpointTus,
  metadatosTus,
  metodoSubida,
  momentoRenovacion,
  progresoConjunto,
  urlSubidaFirmada,
} from "./subida"

const SUPABASE = "https://abc.supabase.co/"

describe("metodoSubida", () => {
  it("usa TUS solo por encima de 6 MB", () => {
    expect(metodoSubida(6 * MIB)).toBe("firmada")
    expect(metodoSubida(6 * MIB + 1)).toBe("tus")
    expect(metodoSubida(40 * MIB, false)).toBe("firmada")
  })
})

describe("destinos", () => {
  it("arma la URL de subida firmada como supabase-js", () => {
    expect(
      urlSubidaFirmada(
        SUPABASE,
        "evidencias",
        "asignacion/1/publicacion/a b.webp",
        "t+k"
      )
    ).toBe(
      "https://abc.supabase.co/storage/v1/object/upload/sign/evidencias/asignacion/1/publicacion/a%20b.webp?token=t%2Bk"
    )
  })

  it("arma el endpoint y los metadatos de TUS", () => {
    expect(endpointTus(SUPABASE)).toBe(
      "https://abc.supabase.co/storage/v1/upload/resumable"
    )
    expect(metadatosTus("creativos", "oferta/a/b/c.mp4", "video/mp4")).toEqual({
      bucketName: "creativos",
      objectName: "oferta/a/b/c.mp4",
      contentType: "video/mp4",
      cacheControl: "3600",
    })
  })
})

describe("progresoConjunto", () => {
  it("pondera por bytes y no pasa de 1", () => {
    expect(
      progresoConjunto([
        { enviados: 50, total: 100 },
        { enviados: 0, total: 100 },
      ])
    ).toBe(0.25)
    expect(progresoConjunto([{ enviados: 500, total: 100 }])).toBe(1)
    expect(progresoConjunto([{ enviados: 0, total: 0 }])).toBe(0)
  })
})

describe("momentoRenovacion", () => {
  it("renueva al 80 % de la vida", () => {
    expect(momentoRenovacion(1_000_000, 300)).toBe(1_000_000 + 240_000)
  })

  it("deja al menos 5 s de margen en vigencias cortas", () => {
    expect(momentoRenovacion(0, 20)).toBe(15_000)
    expect(momentoRenovacion(0, 3)).toBe(0)
  })
})
