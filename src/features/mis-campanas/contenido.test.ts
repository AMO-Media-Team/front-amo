import { describe, expect, it } from "vitest"

import {
  nombreArchivoDescarga,
  resumenArchivos,
  resumenContenido,
  situacionContenido,
  textoCompleto,
  textoHashtags,
  textoMenciones,
} from "./contenido"
import { asignacionDePrueba, versionDePrueba } from "./fixtures"

const ANTES = new Date("2026-10-26T12:00:00.000Z")
const DESPUES = new Date("2026-10-31T12:00:00.000Z")

const V1 = versionDePrueba({ id: "v1", version: 1 })
const V2 = versionDePrueba({ id: "v2", version: 2 })

describe("situacionContenido", () => {
  it("aceptada: primero instrucciones y descargar la vigente", () => {
    expect(
      situacionContenido(
        asignacionDePrueba(),
        { vigente: V1, descargada: null },
        ANTES
      )
    ).toEqual({ tipo: "por_descargar", vigente: V1 })
    expect(
      situacionContenido(
        asignacionDePrueba(),
        { vigente: null, descargada: null },
        ANTES
      )
    ).toEqual({ tipo: "sin_creativo" })
    expect(
      situacionContenido(
        asignacionDePrueba(),
        { vigente: V1, descargada: null },
        DESPUES
      )
    ).toEqual({ tipo: "fuera_de_plazo" })
  })

  it("descargada: al día o con una versión nueva antes de publicar", () => {
    const entregada = asignacionDePrueba({ estado: "CONTENIDO_ENTREGADO" })
    expect(
      situacionContenido(entregada, { vigente: V1, descargada: V1 }, ANTES)
    ).toEqual({ tipo: "al_dia", version: V1 })
    expect(
      situacionContenido(entregada, { vigente: V2, descargada: V1 }, ANTES)
    ).toEqual({ tipo: "version_nueva", descargada: V1, vigente: V2 })
    // Vencido el plazo ya no se descarga otra: ve lo que tiene.
    expect(
      situacionContenido(entregada, { vigente: V2, descargada: V1 }, DESPUES)
    ).toEqual({ tipo: "descargado", version: V1 })
  })

  it("después de publicar ve lo que descargó; caída, nada", () => {
    expect(
      situacionContenido(
        asignacionDePrueba({ estado: "PUBLICADA" }),
        { vigente: V2, descargada: V1 },
        ANTES
      )
    ).toEqual({ tipo: "descargado", version: V1 })
    for (const estado of [
      "RECHAZADA",
      "VENCIDA_SIN_PUBLICAR",
      "CANCELADA",
    ] as const) {
      expect(
        situacionContenido(
          asignacionDePrueba({ estado }),
          { vigente: V1, descargada: V1 },
          ANTES
        )
      ).toEqual({ tipo: "no_disponible" })
    }
    expect(
      situacionContenido(
        asignacionDePrueba({
          estado: "EN_DISPUTA",
          estadoPrevioDisputa: "VENCIDA_SIN_PUBLICAR",
        }),
        { vigente: V1, descargada: V1 },
        ANTES
      )
    ).toEqual({ tipo: "no_disponible" })
  })
})

describe("resumenContenido", () => {
  it("lo dice sin leer el creativo", () => {
    expect(resumenContenido(asignacionDePrueba(), ANTES)).toBe("por_descargar")
    expect(resumenContenido(asignacionDePrueba(), DESPUES)).toBe(
      "fuera_de_plazo"
    )
    expect(
      resumenContenido(
        asignacionDePrueba({
          estado: "CONTENIDO_ENTREGADO",
          creativoDescargadoId: "v1",
        }),
        DESPUES
      )
    ).toBe("descargado")
    expect(
      resumenContenido(asignacionDePrueba({ estado: "CANCELADA" }), ANTES)
    ).toBe("no_disponible")
  })
})

describe("textos para copiar", () => {
  it("hashtags y menciones con su prefijo, separados por espacios", () => {
    expect(textoHashtags(["#Publicidad", "CostaAzul", " "])).toBe(
      "#Publicidad #CostaAzul"
    )
    expect(textoMenciones(["costaazul", "@aliado"])).toBe("@costaazul @aliado")
  })

  it("todo junto en el orden en que se pega", () => {
    expect(textoCompleto(V1)).toBe(
      "¡Llegó el sabor de Halloween!\n\n#Publicidad #CostaAzul\n\n@costaazul\n\nhttps://costaazul.example/halloween"
    )
    expect(
      textoCompleto({
        copySugerido: null,
        hashtags: [],
        menciones: [],
        enlaceDestino: null,
      })
    ).toBe("")
  })
})

describe("archivos", () => {
  it("se guardan con la versión y su posición", () => {
    expect(nombreArchivoDescarga(2, 0, "video/mp4")).toBe("contenido-v2-1.mp4")
    expect(nombreArchivoDescarga(1, 2, "image/jpeg")).toMatch(
      /^contenido-v1-3\.jpe?g$/
    )
    expect(nombreArchivoDescarga(1, 0, "application/x-raro")).toBe(
      "contenido-v1-1"
    )
  })

  it("resume lo que trae la versión", () => {
    expect(resumenArchivos([{ mime: "video/mp4" }])).toBe("1 video")
    expect(
      resumenArchivos([
        { mime: "image/jpeg" },
        { mime: "image/png" },
        { mime: "video/mp4" },
      ])
    ).toBe("2 imágenes y 1 video")
    expect(resumenArchivos([])).toBe("solo texto")
  })
})
