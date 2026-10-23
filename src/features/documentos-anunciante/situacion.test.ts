import { describe, expect, it } from "vitest"

import {
  aprobadoAntesDelCambio,
  EXISTENCIA_EN_FRASE,
  estaVigente,
  presentarSituacion,
  requisitosDocumentales,
  resumirDocumentos,
  situacionDe,
  situacionDeTipo,
  situacionesPorTipo,
  tiposOpcionales,
} from "./situacion"
import type { DocumentoAnunciante } from "./tipos"

const HOY = "2026-10-22"

function documento(
  cambios: Partial<DocumentoAnunciante> = {}
): DocumentoAnunciante {
  return {
    id: "d1",
    tipo: "RUT",
    estado: "PENDIENTE",
    observaciones: null,
    venceEl: null,
    cargadoAt: "2026-10-01T15:00:00Z",
    revisadoAt: null,
    formato: "application/pdf",
    ...cambios,
  }
}

describe("estaVigente", () => {
  it("vale un aprobado sin vencimiento o que vence desde hoy", () => {
    expect(estaVigente(documento({ estado: "APROBADO" }), HOY)).toBe(true)
    expect(
      estaVigente(documento({ estado: "APROBADO", venceEl: HOY }), HOY)
    ).toBe(true)
    expect(
      estaVigente(documento({ estado: "APROBADO", venceEl: "2026-10-21" }), HOY)
    ).toBe(false)
    expect(estaVigente(documento({ estado: "PENDIENTE" }), HOY)).toBe(false)
  })
})

describe("aprobadoAntesDelCambio (cambio de identificación)", () => {
  const CAMBIO = "2026-10-15T12:00:00Z"

  it("solo marca aprobados revisados antes del cambio (o sin fecha de revisión)", () => {
    const aprobado = (revisadoAt: string | null) =>
      documento({ estado: "APROBADO", revisadoAt })
    expect(
      aprobadoAntesDelCambio(aprobado("2026-10-10T15:00:00Z"), CAMBIO)
    ).toBe(true)
    expect(aprobadoAntesDelCambio(aprobado(null), CAMBIO)).toBe(true)
    expect(
      aprobadoAntesDelCambio(aprobado("2026-10-16T15:00:00Z"), CAMBIO)
    ).toBe(false)
    expect(aprobadoAntesDelCambio(aprobado(CAMBIO), CAMBIO)).toBe(false)
    expect(aprobadoAntesDelCambio(aprobado("2026-10-10T15:00:00Z"), null)).toBe(
      false
    )
    expect(
      aprobadoAntesDelCambio(
        documento({ estado: "RECHAZADO", revisadoAt: "2026-10-10T15:00:00Z" }),
        CAMBIO
      )
    ).toBe(false)
  })

  it("un aprobado de antes del cambio ya no está vigente", () => {
    const viejo = documento({
      estado: "APROBADO",
      revisadoAt: "2026-10-10T15:00:00Z",
    })
    expect(estaVigente(viejo, HOY)).toBe(true)
    expect(estaVigente(viejo, HOY, CAMBIO)).toBe(false)
  })

  it("se pide de nuevo: desactualizado, por corregir e impide enviar", () => {
    const rut = documento({
      id: "rut",
      tipo: "RUT",
      estado: "APROBADO",
      revisadoAt: "2026-10-10T15:00:00Z",
    })
    const camara = documento({
      id: "camara",
      tipo: "CAMARA_COMERCIO",
      estado: "APROBADO",
      revisadoAt: "2026-10-16T15:00:00Z",
    })
    expect(situacionDe([rut], HOY, CAMBIO)).toEqual({
      tipo: "desactualizado",
      documento: rut,
    })
    const resumen = resumirDocumentos(
      requisitosDocumentales(
        "CO",
        situacionesPorTipo([rut, camara], HOY, CAMBIO)
      )
    )
    expect(resumen).toMatchObject({
      aprobados: 1,
      porCorregir: 1,
      completo: false,
      listoParaEnviar: false,
    })
    expect(resumen.pendientes.map((requisito) => requisito.id)).toEqual(["RUT"])
    // Sin cambio de identificación, los dos valen.
    expect(
      resumirDocumentos(
        requisitosDocumentales("CO", situacionesPorTipo([rut, camara], HOY))
      ).completo
    ).toBe(true)
  })

  it("con un reemplazo en revisión, se envía sin el aprobado viejo como respaldo", () => {
    const viejo = documento({
      id: "viejo",
      estado: "APROBADO",
      cargadoAt: "2026-09-01T10:00:00Z",
      revisadoAt: "2026-09-02T10:00:00Z",
    })
    const nuevo = documento({ id: "nuevo", cargadoAt: "2026-10-16T10:00:00Z" })
    expect(situacionDe([viejo, nuevo], HOY, CAMBIO)).toEqual({
      tipo: "en-revision",
      documento: nuevo,
      vigente: null,
    })
  })

  it("se presenta como desactualizado y pide cargarlo de nuevo", () => {
    expect(
      presentarSituacion({
        tipo: "desactualizado",
        documento: documento({ estado: "APROBADO" }),
      })
    ).toEqual({
      etiqueta: "Desactualizado",
      tono: "aviso",
      accion: "cargar-de-nuevo",
      requiereAccion: true,
    })
  })
})

describe("situacionDe", () => {
  it("sin cargas, falta", () => {
    expect(situacionDe([], HOY)).toEqual({ tipo: "falta" })
  })

  it("la carga más reciente pendiente está en revisión y conserva el aprobado vigente", () => {
    const aprobado = documento({
      id: "a",
      estado: "APROBADO",
      cargadoAt: "2026-09-01T10:00:00Z",
    })
    const nuevo = documento({ id: "b", cargadoAt: "2026-10-10T10:00:00Z" })
    const situacion = situacionDe([aprobado, nuevo], HOY)
    expect(situacion).toEqual({
      tipo: "en-revision",
      documento: nuevo,
      vigente: aprobado,
    })
  })

  it("un aprobado que vence pronto avisa los días que le quedan", () => {
    const situacion = situacionDe(
      [documento({ estado: "APROBADO", venceEl: "2026-11-01" })],
      HOY
    )
    expect(situacion).toMatchObject({
      tipo: "aprobado",
      diasParaVencer: 10,
      porVencer: true,
    })
  })

  it("un reemplazo rechazado no le quita valor al aprobado", () => {
    const aprobado = documento({
      id: "a",
      estado: "APROBADO",
      cargadoAt: "2026-09-01T10:00:00Z",
    })
    const rechazado = documento({
      id: "b",
      estado: "RECHAZADO",
      observaciones: "Ilegible",
      cargadoAt: "2026-10-10T10:00:00Z",
    })
    expect(situacionDe([rechazado, aprobado], HOY)).toMatchObject({
      tipo: "aprobado",
      documento: aprobado,
      reemplazoRechazado: rechazado,
    })
  })

  it("rechazado sin otro vigente pide cargarlo de nuevo; aprobado vencido es vencido", () => {
    expect(situacionDe([documento({ estado: "RECHAZADO" })], HOY).tipo).toBe(
      "rechazado"
    )
    expect(
      situacionDe(
        [documento({ estado: "APROBADO", venceEl: "2026-10-01" })],
        HOY
      ).tipo
    ).toBe("vencido")
    expect(situacionDe([documento({ estado: "VENCIDO" })], HOY).tipo).toBe(
      "vencido"
    )
  })
})

describe("requisitos y resumen", () => {
  it("Colombia: RUT y Cámara son requisitos separados", () => {
    const situaciones = situacionesPorTipo(
      [documento({ tipo: "RUT", estado: "APROBADO" })],
      HOY
    )
    const requisitos = requisitosDocumentales("CO", situaciones)
    expect(requisitos.map((r) => [r.id, r.estado])).toEqual([
      ["RUT", "aprobado"],
      ["CAMARA_COMERCIO", "falta"],
    ])
    const resumen = resumirDocumentos(requisitos)
    expect(resumen).toMatchObject({
      total: 2,
      aprobados: 1,
      faltan: 1,
      completo: false,
      listoParaEnviar: false,
    })
    expect(resumen.pendientes.map((r) => r.enFrase)).toEqual([
      "la Cámara de Comercio",
    ])
  })

  it("cargados (en revisión) ya alcanzan para enviar, no para verificar", () => {
    const resumen = resumirDocumentos(
      requisitosDocumentales(
        "CO",
        situacionesPorTipo(
          [
            documento({ id: "a", tipo: "RUT" }),
            documento({ id: "b", tipo: "CAMARA_COMERCIO", estado: "APROBADO" }),
          ],
          HOY
        )
      )
    )
    expect(resumen).toMatchObject({
      enRevision: 1,
      aprobados: 1,
      listoParaEnviar: true,
      completo: false,
      pendientes: [],
    })
  })

  it("un rechazado cuenta como por corregir e impide enviar", () => {
    const resumen = resumirDocumentos(
      requisitosDocumentales(
        "CO",
        situacionesPorTipo(
          [
            documento({ id: "a", tipo: "RUT", estado: "RECHAZADO" }),
            documento({ id: "b", tipo: "CAMARA_COMERCIO" }),
          ],
          HOY
        )
      )
    )
    expect(resumen).toMatchObject({ porCorregir: 1, listoParaEnviar: false })
    expect(resumen.pendientes.map((r) => r.titulo)).toEqual(["RUT"])
  })

  it("exterior: un solo requisito que cumple el mejor documento del grupo", () => {
    const vacio = requisitosDocumentales("US", new Map())
    expect(vacio).toEqual([
      expect.objectContaining({
        id: "existencia",
        estado: "falta",
        enFrase: EXISTENCIA_EN_FRASE,
      }),
    ])
    const conOtro = requisitosDocumentales(
      "US",
      situacionesPorTipo(
        [
          documento({ id: "a", tipo: "CAMARA_COMERCIO", estado: "RECHAZADO" }),
          documento({ id: "b", tipo: "OTRO", estado: "APROBADO" }),
        ],
        HOY
      )
    )
    expect(conOtro.map((r) => r.estado)).toEqual(["aprobado"])
    expect(resumirDocumentos(conOtro).completo).toBe(true)
  })

  it("cuenta los aprobados por vencer", () => {
    const resumen = resumirDocumentos(
      requisitosDocumentales(
        "CO",
        situacionesPorTipo(
          [
            documento({
              id: "a",
              tipo: "RUT",
              estado: "APROBADO",
              venceEl: "2026-11-05",
            }),
            documento({ id: "b", tipo: "CAMARA_COMERCIO", estado: "APROBADO" }),
          ],
          HOY
        )
      )
    )
    expect(resumen).toMatchObject({ completo: true, porVencer: 1 })
  })

  it("sin requisitos nunca está completo ni listo", () => {
    expect(resumirDocumentos([])).toMatchObject({
      completo: false,
      listoParaEnviar: false,
    })
  })
})

describe("tiposOpcionales", () => {
  it("lista los opcionales del país y los que ya tienen cargas, nunca los exigidos", () => {
    expect(
      tiposOpcionales(["RUT", "CAMARA_COMERCIO"], ["CERT_BANCARIA", "OTRO"], [])
    ).toEqual(["CERT_BANCARIA", "OTRO"])
    expect(
      tiposOpcionales(
        ["CAMARA_COMERCIO", "OTRO"],
        ["CERT_BANCARIA"],
        [documento({ tipo: "RUT" })]
      )
    ).toEqual(["RUT", "CERT_BANCARIA"])
  })
})

describe("presentarSituacion", () => {
  it("un exigido sin cargar pide atención; un opcional, no", () => {
    expect(presentarSituacion({ tipo: "falta" })).toMatchObject({
      etiqueta: "Sin cargar",
      accion: "cargar",
      requiereAccion: true,
    })
    expect(
      presentarSituacion({ tipo: "falta" }, { exigido: false })
    ).toMatchObject({ etiqueta: "Opcional", requiereAccion: false })
  })

  it("rechazado se carga de nuevo; aprobado por vencer avisa los días", () => {
    expect(
      presentarSituacion(situacionDe([documento({ estado: "RECHAZADO" })], HOY))
    ).toMatchObject({
      etiqueta: "Rechazado",
      tono: "peligro",
      accion: "cargar-de-nuevo",
    })
    expect(
      presentarSituacion(
        situacionDe(
          [documento({ estado: "APROBADO", venceEl: "2026-10-23" })],
          HOY
        )
      )
    ).toMatchObject({ etiqueta: "Vence mañana", tono: "aviso" })
    expect(
      presentarSituacion(
        situacionDe([documento({ estado: "APROBADO", venceEl: HOY })], HOY)
      ).etiqueta
    ).toBe("Vence hoy")
  })

  it("un reemplazo en revisión se distingue de la primera carga", () => {
    const aprobado = documento({
      id: "a",
      estado: "APROBADO",
      cargadoAt: "2026-09-01T10:00:00Z",
    })
    const nuevo = documento({ id: "b", cargadoAt: "2026-10-10T10:00:00Z" })
    expect(
      presentarSituacion(situacionDe([aprobado, nuevo], HOY))
    ).toMatchObject({ etiqueta: "Reemplazo en revisión", accion: "reemplazar" })
    expect(
      presentarSituacion(
        situacionDeTipo(situacionesPorTipo([nuevo], HOY), "RUT")
      ).etiqueta
    ).toBe("En revisión")
  })
})
