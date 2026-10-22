import { describe, expect, it } from "vitest"

import { MIB } from "@/lib/archivos/formato"
import { formatearPorcentaje } from "@/lib/format"

import {
  anuncioEstado,
  describirReglas,
  etiquetaCamara,
  mensajeDemasiados,
  mimesDeCamara,
  textoEstado,
} from "./textos"

const ESPACIO = " "

describe("describirReglas", () => {
  it("resume formatos y límites", () => {
    expect(
      describirReglas({
        mimes: ["image/jpeg", "image/png"],
        maxBytes: 10 * MIB,
      })
    ).toBe(`JPG o PNG · hasta 10${ESPACIO}MB`)
    expect(
      describirReglas({
        mimes: ["video/mp4"],
        maxBytes: 50 * MIB,
        aspecto: { relacion: 9 / 16, tolerancia: 0.02 },
        duracionMaxSeg: 60,
      })
    ).toBe(
      `MP4 · hasta 50${ESPACIO}MB · proporción 9:16 · video de hasta 1${ESPACIO}min`
    )
  })
})

describe("cámara", () => {
  it("nombra la acción según lo que se admite", () => {
    expect(etiquetaCamara(["image/jpeg", "application/pdf"])).toBe("Tomar foto")
    expect(etiquetaCamara(["video/mp4"])).toBe("Grabar video")
    expect(etiquetaCamara(["image/jpeg", "video/mp4"])).toBe("Usar la cámara")
    expect(etiquetaCamara(["application/pdf"])).toBeNull()
  })

  it("solo ofrece a la cámara imágenes y videos", () => {
    expect(
      mimesDeCamara(["application/pdf", "image/png", "video/mp4"])
    ).toEqual(["image/png", "video/mp4"])
  })

  it("explica el límite de archivos", () => {
    expect(mensajeDemasiados(1)).toBe(
      "Elige un solo archivo: se tomó el primero."
    )
    expect(mensajeDemasiados(5)).toBe(
      "Puedes elegir hasta 5 archivos a la vez: se tomaron los primeros 5."
    )
  })
})

describe("estado de una subida", () => {
  const base = { progreso: 0, error: null, intento: 0 }

  it("muestra el porcentaje al subir", () => {
    expect(
      textoEstado({ ...base, estado: "subiendo", progreso: 0.456 }, null, 4)
    ).toBe(`Subiendo… ${formatearPorcentaje(0.46, 0)}`)
  })

  it("cuenta los segundos hasta el reintento", () => {
    expect(
      textoEstado({ ...base, estado: "reintentando", intento: 2 }, 8, 4)
    ).toBe("Falló la conexión. Reintento 2 de 4 en 8 s")
    expect(
      textoEstado({ ...base, estado: "reintentando", intento: 2 }, 0, 4)
    ).toBe("Reintento 2 de 4…")
  })

  it("muestra la causa del error", () => {
    expect(
      textoEstado({ ...base, estado: "error", error: "Sin permiso." }, null, 4)
    ).toBe("Sin permiso.")
    expect(textoEstado({ ...base, estado: "pausada" }, null, 4)).toMatch(
      /Sin conexión/
    )
  })

  it("anuncia solo los hitos al lector de pantalla", () => {
    expect(anuncioEstado("a.png", { estado: "subiendo", error: null })).toBe("")
    expect(anuncioEstado("a.png", { estado: "completada", error: null })).toBe(
      "a.png: subido."
    )
    expect(anuncioEstado("a.png", { estado: "error", error: "Falló." })).toBe(
      "a.png: Falló."
    )
  })
})
