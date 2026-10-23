import { describe, expect, it } from "vitest"

import { aDocumentoAnunciante, aEmpresaDocumentos } from "./filas"

describe("aDocumentoAnunciante", () => {
  it("descarta la ruta y conserva el formato de su extensión", () => {
    const documento = aDocumentoAnunciante({
      id: "d1",
      tipo: "CAMARA_COMERCIO",
      estado_validacion: "RECHAZADO",
      observaciones: "  Tiene más de 30 días  ",
      fecha_vencimiento: null,
      created_at: "2026-10-01T15:00:00Z",
      validado_at: "2026-10-02T15:00:00Z",
      archivo_path: "anunciante/a/CAMARA_COMERCIO/b.pdf",
    })
    expect(documento).toEqual({
      id: "d1",
      tipo: "CAMARA_COMERCIO",
      estado: "RECHAZADO",
      observaciones: "Tiene más de 30 días",
      venceEl: null,
      cargadoAt: "2026-10-01T15:00:00Z",
      revisadoAt: "2026-10-02T15:00:00Z",
      formato: "application/pdf",
    })
    expect(documento).not.toHaveProperty("archivo_path")
  })

  it("observaciones vacías quedan en null", () => {
    expect(
      aDocumentoAnunciante({
        id: "d1",
        tipo: "RUT",
        estado_validacion: "PENDIENTE",
        observaciones: "   ",
        fecha_vencimiento: null,
        created_at: "2026-10-01T15:00:00Z",
        validado_at: null,
        archivo_path: "anunciante/a/RUT/b.webp",
      }).observaciones
    ).toBeNull()
  })
})

describe("aEmpresaDocumentos", () => {
  it("normaliza el país (`char(2)`)", () => {
    expect(
      aEmpresaDocumentos({
        id: "a",
        nombre_comercial: "Andina",
        pais_iso2: "co",
        estado_verificacion: "PENDIENTE",
        enviado_verificacion_at: null,
        identificacion_cambiada_at: "2026-10-20T15:00:00Z",
      })
    ).toEqual({
      id: "a",
      nombre: "Andina",
      pais: "CO",
      estado: "PENDIENTE",
      enviadoVerificacionAt: null,
      identificacionCambiadaAt: "2026-10-20T15:00:00Z",
    })
  })
})
