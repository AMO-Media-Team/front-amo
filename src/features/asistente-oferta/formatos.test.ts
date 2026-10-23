import { describe, expect, it } from "vitest"

import {
  formatosPorPlataforma,
  nombreFormato,
  requisitosDeFormato,
  resumenRequisitos,
  tipoDePieza,
} from "./formatos"
import type { FormatoAsistente } from "./tipos"

function formato(
  parcial: Partial<FormatoAsistente> & Pick<FormatoAsistente, "id">
): FormatoAsistente {
  return {
    plataforma: "INSTAGRAM",
    clave: "REEL",
    nombre: "Reel",
    orden: 1,
    requisitos: requisitosDeFormato({}),
    ...parcial,
  }
}

describe("requisitosDeFormato", () => {
  it("usa la interpretación del paquete de creativos (sin máximo: un archivo)", () => {
    expect(requisitosDeFormato({ relaciones_aspecto: ["9:16"] })).toMatchObject(
      {
        relacionesAspecto: ["9:16"],
        maxArchivos: 1,
      }
    )
  })
})

describe("formatosPorPlataforma", () => {
  const formatos = [
    formato({
      id: "tt",
      plataforma: "TIKTOK",
      clave: "VIDEO",
      nombre: "Video",
      orden: 9,
    }),
    formato({
      id: "ig-h",
      plataforma: "INSTAGRAM",
      clave: "HISTORIA",
      nombre: "Historia",
      orden: 4,
    }),
    formato({
      id: "ig-r",
      plataforma: "INSTAGRAM",
      clave: "REEL",
      nombre: "Reel",
      orden: 3,
    }),
  ]

  it("agrupa en el orden de la operación y por el orden de cada formato", () => {
    const grupos = formatosPorPlataforma(formatos)
    expect(grupos.map((g) => g.nombre)).toEqual(["Instagram", "TikTok"])
    expect(grupos[0].formatos.map((f) => f.id)).toEqual(["ig-r", "ig-h"])
  })

  it("cada plataforma ofrece solo sus formatos: TikTok no tiene historias", () => {
    const tiktok = formatosPorPlataforma(formatos).find(
      (g) => g.plataforma === "TIKTOK"
    )
    expect(tiktok?.formatos.map((f) => f.nombre)).toEqual(["Video"])
  })

  it("omite plataformas sin formatos activos", () => {
    expect(
      formatosPorPlataforma(formatos).some((g) => g.plataforma === "FACEBOOK")
    ).toBe(false)
  })
})

describe("textos de formato", () => {
  it("nombra el formato con su plataforma", () => {
    expect(nombreFormato({ nombre: "Reel", plataforma: "INSTAGRAM" })).toBe(
      "Reel · Instagram"
    )
  })

  it("dice el tipo de pieza", () => {
    expect(tipoDePieza(requisitosDeFormato({ mime: ["video/mp4"] }))).toBe(
      "Video"
    )
    expect(tipoDePieza(requisitosDeFormato({ mime: ["image/png"] }))).toBe(
      "Imagen"
    )
    expect(
      tipoDePieza(requisitosDeFormato({ mime: ["image/png", "video/mp4"] }))
    ).toBe("Imagen o video")
  })

  it("resume los requisitos con el menor tope de peso", () => {
    const reel = requisitosDeFormato({
      mime: ["video/mp4"],
      peso_max_mb: 50,
      duracion_max_s: 90,
      relaciones_aspecto: ["9:16"],
    })
    expect(resumenRequisitos(reel, 25)).toBe(
      "Video · 9:16 · hasta 90 s de video · hasta 25 MB por archivo"
    )
    const carrusel = requisitosDeFormato({
      mime: ["image/jpeg", "video/mp4"],
      max_archivos: 10,
      relaciones_aspecto: ["1:1", "4:5"],
    })
    expect(resumenRequisitos(carrusel)).toBe(
      "Imagen o video · de 2 a 10 archivos · 1:1 o 4:5"
    )
    const video = requisitosDeFormato({
      mime: ["video/mp4"],
      duracion_max_s: 600,
      relaciones_aspecto: ["16:9", "1:1", "9:16"],
    })
    expect(resumenRequisitos(video)).toBe(
      "Video · 16:9, 1:1 o 9:16 · hasta 10 minutos de video"
    )
  })
})
