import { describe, expect, it } from "vitest"

import { presentarAtencion, resumirComentario } from "./operacion"

const AHORA = new Date("2026-10-22T15:00:00Z")

describe("resumirComentario", () => {
  it("deja el comentario corto tal cual y colapsa los espacios", () => {
    expect(resumirComentario("  Falta la   etiqueta\nde publicidad.  ")).toBe(
      "Falta la etiqueta de publicidad."
    )
  })

  it("corta un comentario largo en una palabra completa", () => {
    const texto =
      "El enlace de destino no es seguro y el copy menciona una promoción que no aparece en el creativo cargado para el reel."
    const resumen = resumirComentario(texto, 60)
    expect(resumen.endsWith("…")).toBe(true)
    expect(resumen.length).toBeLessThanOrEqual(61)
    expect(texto.startsWith(resumen.slice(0, -1))).toBe(true)
    expect(resumen).not.toMatch(/\s…$/)
  })
})

describe("presentarAtencion", () => {
  const oferta = {
    comentarioModeracion: "Falta la etiqueta de publicidad.",
    devueltaAt: "2026-10-21T15:00:00Z",
  }

  it("una devuelta cita el comentario de la moderación", () => {
    expect(
      presentarAtencion(
        { oferta, motivo: "devuelta", limiteEnvio: null },
        AHORA
      )
    ).toEqual({
      titulo: "AMO te la devolvió para ajustarla",
      detalle: "«Falta la etiqueta de publicidad.»",
      tono: "aviso",
      instante: "2026-10-21T15:00:00Z",
    })
    expect(
      presentarAtencion(
        {
          oferta: { ...oferta, comentarioModeracion: " " },
          motivo: "devuelta",
          limiteEnvio: null,
        },
        AHORA
      ).detalle
    ).toBe("Revisa la oferta, ajústala y reenvíala.")
  })

  it("un borrador con el plazo encima dice cuándo vence", () => {
    const proximo = presentarAtencion(
      {
        oferta,
        motivo: "envio_proximo",
        limiteEnvio: "2026-10-23T15:00:00.000Z",
      },
      AHORA
    )
    expect(proximo.titulo).toBe("Envíala a revisión pronto")
    expect(proximo.detalle).toMatch(/^El plazo para enviarla vence mañana \(/)
    expect(proximo.tono).toBe("info")
    const vencido = presentarAtencion(
      {
        oferta,
        motivo: "envio_vencido",
        limiteEnvio: "2026-10-22T10:00:00.000Z",
      },
      AHORA
    )
    expect(vencido.titulo).toBe("Su fecha límite ya no alcanza")
    expect(vencido.tono).toBe("peligro")
  })
})
