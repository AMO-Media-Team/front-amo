import { describe, expect, it } from "vitest"

import { documentoExpediente } from "./filas"

describe("documentoExpediente", () => {
  it("de la ruta solo sale el MIME; la ruta no viaja a la interfaz", () => {
    const documento = documentoExpediente({
      id: "doc-1",
      tipo: "RUT",
      estado_validacion: "PENDIENTE",
      fecha_vencimiento: null,
      observaciones: null,
      validado_at: null,
      created_at: "2026-10-20T15:00:00.000Z",
      archivo_path: "anunciante/abc/RUT/0192f3a4.pdf",
    })
    expect(documento).toEqual({
      id: "doc-1",
      tipo: "RUT",
      estado: "PENDIENTE",
      venceAt: null,
      subidoAt: "2026-10-20T15:00:00.000Z",
      observaciones: null,
      validadoAt: null,
      mime: "application/pdf",
    })
    expect(JSON.stringify(documento)).not.toContain("anunciante/abc")
  })

  it("una foto conserva su tipo de imagen", () => {
    expect(
      documentoExpediente({
        id: "doc-2",
        tipo: "CAMARA_COMERCIO",
        estado_validacion: "APROBADO",
        fecha_vencimiento: "2027-01-01",
        observaciones: "Vigente",
        validado_at: "2026-10-21T15:00:00.000Z",
        created_at: "2026-10-20T15:00:00.000Z",
        archivo_path: "anunciante/abc/CAMARA_COMERCIO/x.webp",
      }).mime
    ).toBe("image/webp")
  })
})
