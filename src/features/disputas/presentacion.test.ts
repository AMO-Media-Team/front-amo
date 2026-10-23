import { describe, expect, it } from "vitest"

import {
  aperturaPosible,
  autorDeMensaje,
  avisoVisibilidad,
  efectoResolucion,
  estaAbierta,
  motivosDisponibles,
  nombreParte,
  presentacionEstado,
  quienAbrio,
  situacionDisputa,
} from "./presentacion"
import type { DisputaDetalle } from "./tipos"

const AHORA = new Date("2026-10-23T15:00:00Z")

type Base = Pick<
  DisputaDetalle,
  "estado" | "parte" | "estadoOrigen" | "estadoResultante"
>

function disputa(cambios: Partial<Base> = {}): Base {
  return {
    estado: "ABIERTA",
    parte: "MEDIO",
    estadoOrigen: "METRICAS_CARGADAS",
    estadoResultante: null,
    ...cambios,
  }
}

describe("motivos y apertura", () => {
  it("cada parte elige los motivos de su lado en los estados disputables", () => {
    expect(motivosDisponibles("MEDIO", "PUBLICADA")).toEqual([
      "METRICAS",
      "CONTENIDO",
      "PAGO",
      "OTRO",
    ])
    expect(motivosDisponibles("ANUNCIANTE", "VERIFICADA")).toEqual([
      "INCUMPLIMIENTO",
      "METRICAS",
      "CONTENIDO",
      "PERMANENCIA",
      "OTRO",
    ])
    expect(motivosDisponibles("ADMIN", "EVIDENCIA_VALIDADA")).toHaveLength(6)
    expect(motivosDisponibles("MEDIO", "ACEPTADA")).toEqual([])
  })

  it("una vencida solo la reclama el medio, con «Otro» o «Incumplimiento» (D70)", () => {
    expect(motivosDisponibles("MEDIO", "VENCIDA_SIN_PUBLICAR")).toEqual([
      "OTRO",
      "INCUMPLIMIENTO",
    ])
    expect(motivosDisponibles("ANUNCIANTE", "VENCIDA_SIN_PUBLICAR")).toEqual([])
    expect(motivosDisponibles("ADMIN", "VENCIDA_SIN_PUBLICAR")).toEqual([])
  })

  it("explica por qué no se puede abrir una disputa", () => {
    expect(
      aperturaPosible({
        parte: "ANUNCIANTE",
        estadoAsignacion: "PAGADA",
        hayAbierta: false,
        ahora: AHORA,
      }).bloqueo
    ).toBe("La asignación ya se liquidó: no admite disputas.")
    expect(
      aperturaPosible({
        parte: "MEDIO",
        estadoAsignacion: "PUBLICADA",
        hayAbierta: true,
        ahora: AHORA,
      })
    ).toEqual({
      motivos: [],
      bloqueo: "Ya hay una disputa abierta sobre esta asignación.",
    })
    expect(
      aperturaPosible({
        parte: "ANUNCIANTE",
        estadoAsignacion: "VENCIDA_SIN_PUBLICAR",
        hayAbierta: false,
        ahora: AHORA,
      }).bloqueo
    ).toBe("Una asignación vencida solo la reclama el medio.")
    expect(
      aperturaPosible({
        parte: "MEDIO",
        estadoAsignacion: "ACEPTADA",
        hayAbierta: false,
        ahora: AHORA,
      }).bloqueo
    ).toBe("En «aceptada» la asignación no admite disputas.")
  })

  it("el reclamo de una vencida vale hasta `reclamoHasta`", () => {
    const dentro = aperturaPosible({
      parte: "MEDIO",
      estadoAsignacion: "VENCIDA_SIN_PUBLICAR",
      hayAbierta: false,
      reclamoHasta: "2026-10-24T15:00:00Z",
      ahora: AHORA,
    })
    expect(dentro).toEqual({
      motivos: ["OTRO", "INCUMPLIMIENTO"],
      bloqueo: null,
    })
    const fuera = aperturaPosible({
      parte: "MEDIO",
      estadoAsignacion: "VENCIDA_SIN_PUBLICAR",
      hayAbierta: false,
      reclamoHasta: "2026-10-22T15:00:00Z",
      ahora: AHORA,
    })
    expect(fuera.motivos).toEqual([])
    expect(fuera.bloqueo).toMatch(/^El plazo para reclamar terminó el 22/)
  })
})

describe("partes y autores", () => {
  it("nombra a cada parte en la voz de quien mira", () => {
    expect(nombreParte("MEDIO", "interno")).toBe("el medio")
    expect(nombreParte("MEDIO", "medio")).toBe("tu medio")
    expect(nombreParte("ANUNCIANTE", "anunciante")).toBe("tu empresa")
    expect(nombreParte("ANUNCIANTE", "medio")).toBe("el anunciante")
    expect(nombreParte("ADMIN", "anunciante")).toBe("el equipo AMO")
    expect(quienAbrio("MEDIO", "medio")).toBe("La abriste tú")
    expect(quienAbrio("ANUNCIANTE", "anunciante")).toBe("La abrió tu empresa")
    expect(quienAbrio("ADMIN", "interno")).toBe("La abrió el equipo AMO")
  })

  it("dice quién verá lo que se escribe", () => {
    expect(avisoVisibilidad("medio")).toBe(
      "Lo que escribas y adjuntes lo verán el anunciante y el equipo AMO."
    )
    expect(avisoVisibilidad("anunciante")).toBe(
      "Lo que escribas y adjuntes lo verán el medio y el equipo AMO."
    )
    expect(avisoVisibilidad("interno", true)).toBe("Solo la ve el equipo AMO.")
  })

  it("presenta al autor: «Tú», la entidad con su parte y la persona solo al equipo", () => {
    const base = {
      autorParte: "ANUNCIANTE" as const,
      autorNombre: "Almacenes El Faro",
      autorPersona: "Laura Gómez",
      esMio: false,
    }
    expect(autorDeMensaje(base, "medio")).toEqual({
      nombre: "Almacenes El Faro",
      detalle: "Anunciante",
    })
    expect(autorDeMensaje(base, "interno")).toEqual({
      nombre: "Almacenes El Faro",
      detalle: "Anunciante · Laura Gómez",
    })
    expect(autorDeMensaje({ ...base, esMio: true }, "anunciante")).toEqual({
      nombre: "Tú",
      detalle: null,
    })
    expect(
      autorDeMensaje(
        { ...base, autorParte: "ADMIN", autorNombre: "Equipo AMO" },
        "medio"
      )
    ).toEqual({ nombre: "Equipo AMO", detalle: null })
  })
})

describe("estados y efectos", () => {
  it("abiertas son ABIERTA y EN_REVISION", () => {
    expect(estaAbierta("ABIERTA")).toBe(true)
    expect(estaAbierta("EN_REVISION")).toBe(true)
    expect(estaAbierta("RESUELTA")).toBe(false)
    expect(presentacionEstado("ABIERTA", "interno").tono).toBe("peligro")
    expect(presentacionEstado("ABIERTA", "medio").descripcion).toBe(
      "El equipo AMO la revisará pronto."
    )
  })

  it("deduce el efecto de la resolución", () => {
    expect(efectoResolucion(disputa())).toBeNull()
    expect(efectoResolucion(disputa({ estado: "DESCARTADA" }))).toBe(
      "descartar"
    )
    expect(
      efectoResolucion(
        disputa({ estado: "RESUELTA", estadoResultante: "VERIFICADA" })
      )
    ).toBe("verificar")
    expect(
      efectoResolucion(
        disputa({
          estado: "RESUELTA",
          estadoOrigen: "VENCIDA_SIN_PUBLICAR",
          estadoResultante: "CONTENIDO_ENTREGADO",
        })
      )
    ).toBe("reabrir")
    expect(
      efectoResolucion(
        disputa({ estado: "RESUELTA", estadoResultante: "CANCELADA" })
      )
    ).toBe("cancelar")
    expect(
      efectoResolucion(
        disputa({ estado: "RESUELTA", estadoResultante: "METRICAS_CARGADAS" })
      )
    ).toBe("restaurar")
  })
})

describe("situacionDisputa", () => {
  it("abierta: el equipo ve quién la abrió; la parte, qué queda en pausa", () => {
    expect(situacionDisputa(disputa(), "interno")).toMatchObject({
      clave: "abierta",
      titulo: "Espera que alguien la tome",
      descripcion: expect.stringContaining("La abrió el medio."),
    })
    const propia = situacionDisputa(disputa(), "medio")
    expect(propia.titulo).toBe("Recibimos tu disputa")
    expect(propia.descripcion).toContain(
      "Si tienes cortes de métricas pendientes, sigue cargándolos."
    )
    const ajena = situacionDisputa(
      disputa({ estado: "EN_REVISION" }),
      "anunciante"
    )
    expect(ajena).toMatchObject({
      clave: "revision",
      titulo: "El medio abrió una disputa",
    })
  })

  it("el reclamo de una vencida avisa que el cupo no vuelve mientras se revisa", () => {
    const reclamo = disputa({ estadoOrigen: "VENCIDA_SIN_PUBLICAR" })
    expect(
      situacionDisputa(reclamo, "medio", { plazoRecargaHoras: 24 })
    ).toEqual({
      clave: "abierta",
      tono: "aviso",
      titulo: "Recibimos tu reclamo",
      descripcion:
        "Mientras lo revisamos, el cupo no vuelve a tu cuenta. Si te damos la razón, tendrás 24 horas para cargar la evidencia.",
    })
    expect(situacionDisputa(reclamo, "anunciante").titulo).toBe(
      "El medio reclama una publicación vencida"
    )
  })

  it("reabierta: al medio «Te dimos la razón» con su nuevo plazo", () => {
    const reabierta = disputa({
      estado: "RESUELTA",
      estadoOrigen: "VENCIDA_SIN_PUBLICAR",
      estadoResultante: "CONTENIDO_ENTREGADO",
    })
    const medio = situacionDisputa(reabierta, "medio", {
      fechaLimitePublicacion: "2026-10-24T20:00:00Z",
    })
    expect(medio.titulo).toBe("Te dimos la razón")
    expect(medio.descripcion).toMatch(
      /^Tienes hasta el 24 de oct.* para cargar la evidencia de tu publicación\.$/
    )
    expect(
      situacionDisputa(reabierta, "medio", { plazoRecargaHoras: 24 })
        .descripcion
    ).toBe(
      "Tienes 24 horas desde la resolución para cargar la evidencia de tu publicación."
    )
    expect(situacionDisputa(reabierta, "anunciante").descripcion).toMatch(
      /^Le dimos la razón al medio: tiene/
    )
  })

  it("cancelada por fraude: según los términos, no se paga", () => {
    const cancelada = disputa({
      estado: "RESUELTA",
      parte: "ANUNCIANTE",
      estadoResultante: "CANCELADA",
    })
    expect(
      situacionDisputa(cancelada, "medio", { causaCancelacion: "FRAUDE" })
    ).toMatchObject({
      titulo: "Se canceló tu participación",
      descripcion:
        "Según los términos que aceptaste, esta publicación no se paga.",
    })
    expect(
      situacionDisputa(cancelada, "interno", { causaCancelacion: "FRAUDE" })
        .descripcion
    ).toBe("Causa: fraude. Su cupo y su presupuesto volvieron a la oferta.")
    expect(situacionDisputa(cancelada, "anunciante").descripcion).toBe(
      "Esta publicación no se te cobra. Su cupo y su presupuesto volvieron a la oferta."
    )
  })

  it("restaurada: «Se mantuvo la decisión» para quien la abrió", () => {
    const restaurada = disputa({
      estado: "RESUELTA",
      estadoResultante: "METRICAS_CARGADAS",
    })
    expect(situacionDisputa(restaurada, "medio").titulo).toBe(
      "Se mantuvo la decisión"
    )
    expect(situacionDisputa(restaurada, "anunciante").titulo).toBe(
      "Todo sigue como estaba"
    )
    expect(situacionDisputa(restaurada, "interno").titulo).toBe(
      "Resuelta: se restauró «métricas cargadas»"
    )
    const vencida = disputa({
      estado: "RESUELTA",
      estadoOrigen: "VENCIDA_SIN_PUBLICAR",
      estadoResultante: "VENCIDA_SIN_PUBLICAR",
    })
    expect(situacionDisputa(vencida, "interno").titulo).toBe(
      "Resuelta: se mantuvo el vencimiento"
    )
    expect(situacionDisputa(vencida, "medio").descripcion).toBe(
      "Revisamos tu reclamo y la asignación sigue vencida: el cupo no vuelve a tu cuenta."
    )
  })

  it("verificada y descartada en la voz de cada parte", () => {
    const verificada = disputa({
      estado: "RESUELTA",
      estadoResultante: "VERIFICADA",
    })
    expect(situacionDisputa(verificada, "medio")).toMatchObject({
      clave: "verificada",
      titulo: "Quedó verificada",
      tono: "exito",
    })
    const descartada = disputa({
      estado: "DESCARTADA",
      estadoOrigen: "VENCIDA_SIN_PUBLICAR",
    })
    expect(situacionDisputa(descartada, "medio").titulo).toBe(
      "Se descartó tu reclamo"
    )
    expect(situacionDisputa(descartada, "anunciante").titulo).toBe(
      "Se descartó la disputa"
    )
    expect(situacionDisputa(descartada, "interno").descripcion).toBe(
      "La disputa no prosperó: la asignación volvió a «vencida sin publicar»."
    )
  })
})
