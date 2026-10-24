import { describe, expect, it } from "vitest"

import { describirAdjunto, etiquetaAdjunto, mimeDeRuta } from "./adjuntos"

const D = "0192f3a4-5b6c-7d8e-9f01-0000000000d1"

describe("adjuntos de una disputa", () => {
  it("deduce el tipo por la extensión de la ruta", () => {
    expect(mimeDeRuta(`disputa/${D}/a.webp`)).toBe("image/webp")
    expect(mimeDeRuta(`disputa/${D}/interno/a.PDF`)).toBe("application/pdf")
    expect(mimeDeRuta(`disputa/${D}/a.jpg`)).toBe("image/jpeg")
    expect(mimeDeRuta(`disputa/${D}/a.zip`)).toBe("application/octet-stream")
  })

  it("lo describe sin revelar la ruta, con la fecha del mensaje", () => {
    expect(describirAdjunto(null, "2026-10-23T15:00:00Z")).toBeNull()
    const adjunto = describirAdjunto(
      `disputa/${D}/abc.pdf`,
      "2026-10-23T15:00:00Z"
    )
    expect(adjunto?.tipo).toBe("application/pdf")
    expect(adjunto?.nombre).toMatch(/^Adjunto del 23 de oct.* 2026\.pdf$/)
    expect(adjunto?.nombre).not.toContain(D)
    expect(etiquetaAdjunto(adjunto!)).toBe("PDF adjunto")
    expect(
      etiquetaAdjunto({ tipo: "image/webp", nombre: "Adjunto.webp" })
    ).toBe("Imagen adjunta")
  })
})
