import { describe, expect, it } from "vitest"

import {
  describirPeriodo,
  nombrePublicacion,
  REVISION_PARA_MEDIO,
  textoSituacionEvidencia,
  textoSituacionMetricas,
  tituloEvidencia,
} from "./presentacion"

describe("presentación de la ejecución", () => {
  it("nombra la publicación según cuántas pide la oferta", () => {
    expect(nombrePublicacion(1, 1)).toBe("tu publicación")
    expect(nombrePublicacion(2, 3)).toBe("la publicación 2")
    expect(tituloEvidencia(1, 1)).toBe("Evidencia de tu publicación")
    expect(tituloEvidencia(3, 3)).toBe("Evidencia de la publicación 3")
  })

  it("cuenta la revisión en voz del medio", () => {
    expect(REVISION_PARA_MEDIO.RECHAZADA.etiqueta).toBe("Por corregir")
    expect(REVISION_PARA_MEDIO.PENDIENTE.etiqueta).toBe("En revisión")
  })

  it("explica por qué no se puede enviar la evidencia", () => {
    expect(textoSituacionEvidencia({ tipo: "cargar" })).toBeNull()
    expect(
      textoSituacionEvidencia({ tipo: "en-revision", editable: true })
    ).toBeNull()
    expect(textoSituacionEvidencia({ tipo: "descargar-primero" })?.titulo).toBe(
      "Primero descarga el contenido"
    )
    expect(
      textoSituacionEvidencia({
        tipo: "vencida",
        reclamoHasta: "2026-10-25T17:00:00.000Z",
      })?.descripcion
    ).toMatch(/puedes reclamar hasta el 25 .*2026/)
    expect(
      textoSituacionEvidencia({ tipo: "vencida", reclamoHasta: null })
        ?.descripcion
    ).toMatch(/revisa en la campaña si aún puedes reclamar/)
    // Sin canal propio: nunca se le pide «escribirle al equipo AMO» (D74).
    expect(
      textoSituacionEvidencia({
        tipo: "vencida",
        reclamoHasta: "2026-10-25T17:00:00.000Z",
      })?.descripcion
    ).toMatch(/«Reclamar: sí publiqué»/)
  })

  it("explica por qué no se puede cargar el corte", () => {
    expect(
      textoSituacionMetricas(
        { tipo: "bloqueada", desde: "2026-10-24T14:00:00.000Z" },
        "H72"
      )
    ).toEqual({
      titulo: "Las métricas de 72 horas aún no están listas",
      descripcion: expect.stringMatching(/^Se habilitan el 24 .*2026/),
    })
    expect(
      textoSituacionMetricas({ tipo: "aprobada" }, "H24")?.descripcion
    ).toMatch(/solo el equipo puede corregirlas.*«Reportar un problema»/)
    expect(textoSituacionMetricas({ tipo: "cargar" }, "H24")).toBeNull()
  })

  it("describe un periodo con sus días (el fin guardado es exclusivo)", () => {
    expect(
      describirPeriodo("2026-10-21T05:00:00.000Z", "2026-10-23T05:00:00.000Z")
    ).toMatch(/^Del 21 .* al 22 /)
  })
})
