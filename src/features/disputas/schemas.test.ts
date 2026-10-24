import { describe, expect, it } from "vitest"

import {
  esDestinoResolucion,
  esquemaAbrirDisputa,
  esquemaDescartarDisputa,
  esquemaFirmarAdjunto,
  esquemaMensajeDisputa,
  esquemaPrepararAdjunto,
  esquemaResolverDisputa,
} from "./schemas"

const ID = "0192f3a4-5b6c-7d8e-9f01-0000000000d1"

function mensajes(resultado: {
  success: boolean
  error?: { issues: { path: PropertyKey[]; message: string }[] }
}) {
  return Object.fromEntries(
    (resultado.error?.issues ?? []).map((issue) => [
      issue.path.join("."),
      issue.message,
    ])
  )
}

describe("abrir una disputa", () => {
  it("exige motivo del catálogo y una descripción de al menos 10 caracteres", () => {
    expect(
      esquemaAbrirDisputa.safeParse({
        asignacionId: ID,
        motivo: "OTRO",
        descripcion: "  Sí publiqué y no se registró  ",
      })
    ).toMatchObject({
      success: true,
      data: { descripcion: "Sí publiqué y no se registró" },
    })
    expect(
      mensajes(
        esquemaAbrirDisputa.safeParse({
          asignacionId: ID,
          motivo: "INVENTADO",
          descripcion: "corta",
        })
      )
    ).toEqual({
      motivo: "Elige el motivo.",
      descripcion: "Describe lo que pasó (al menos 10 caracteres).",
    })
  })
})

describe("mensajes y adjuntos", () => {
  it("un mensaje no puede quedar vacío y es público por omisión", () => {
    expect(
      esquemaMensajeDisputa.safeParse({ disputaId: ID, mensaje: "  Hola  " })
    ).toMatchObject({
      success: true,
      data: { mensaje: "Hola", interno: false },
    })
    expect(
      mensajes(esquemaMensajeDisputa.safeParse({ disputaId: ID, mensaje: " " }))
    ).toEqual({ mensaje: "Escribe el mensaje." })
    expect(
      esquemaMensajeDisputa.safeParse({
        disputaId: ID,
        mensaje: "x".repeat(4001),
      }).success
    ).toBe(false)
  })

  it("los adjuntos son imagen o PDF de hasta 10 MB", () => {
    const descripcion = {
      nombre: "captura.webp",
      tipo: "image/webp",
      tamano: 200_000,
      sha256: null,
      dimensiones: null,
      duracionSeg: null,
      conMiniatura: false,
    }
    expect(
      esquemaPrepararAdjunto.safeParse({ disputaId: ID, descripcion }).success
    ).toBe(true)
    expect(
      esquemaPrepararAdjunto.safeParse({
        disputaId: ID,
        descripcion: { ...descripcion, tipo: "video/mp4" },
      }).success
    ).toBe(false)
    expect(
      esquemaPrepararAdjunto.safeParse({
        disputaId: ID,
        descripcion: { ...descripcion, tamano: 11 * 1024 * 1024 },
      }).success
    ).toBe(false)
  })

  it("firmar un adjunto pide el id del mensaje", () => {
    expect(
      esquemaFirmarAdjunto.safeParse({ disputaId: ID, mensajeId: 12 })
    ).toMatchObject({ success: true, data: { descargar: false } })
    expect(
      esquemaFirmarAdjunto.safeParse({ disputaId: ID, mensajeId: 0 }).success
    ).toBe(false)
  })
})

describe("resolver y descartar", () => {
  const base = {
    disputaId: ID,
    estadoResultante: "METRICAS_CARGADAS",
    motivo: "Revisamos las pruebas de ambas partes.",
  } as const

  it("acepta los destinos de una disputa y exige la explicación", () => {
    expect(esquemaResolverDisputa.safeParse(base).success).toBe(true)
    expect(
      mensajes(
        esquemaResolverDisputa.safeParse({
          ...base,
          estadoResultante: "PAGADA",
          motivo: "corta",
        })
      )
    ).toEqual({
      estadoResultante: "Elige qué pasa con la asignación.",
      motivo: "Explica la decisión (al menos 10 caracteres).",
    })
  })

  it("cancelar exige la causa", () => {
    expect(
      mensajes(
        esquemaResolverDisputa.safeParse({
          ...base,
          estadoResultante: "CANCELADA",
        })
      )
    ).toEqual({ causa: "Elige la causa de la cancelación." })
    expect(
      esquemaResolverDisputa.safeParse({
        ...base,
        estadoResultante: "CANCELADA",
        causa: "FRAUDE",
      }).success
    ).toBe(true)
  })

  it("los destinos válidos son los de `EN_DISPUTA → x`", () => {
    expect(esDestinoResolucion("CONTENIDO_ENTREGADO")).toBe(true)
    expect(esDestinoResolucion("VENCIDA_SIN_PUBLICAR")).toBe(true)
    expect(esDestinoResolucion("LIQUIDADA")).toBe(false)
    expect(esDestinoResolucion("ACEPTADA")).toBe(false)
  })

  it("descartar usa los límites del diálogo de motivo", () => {
    expect(
      esquemaDescartarDisputa.safeParse({ disputaId: ID, motivo: "Duplicada." })
        .success
    ).toBe(true)
    expect(
      esquemaDescartarDisputa.safeParse({
        disputaId: ID,
        motivo: "x".repeat(501),
      }).success
    ).toBe(false)
  })
})
