import { describe, expect, it } from "vitest"

import {
  DIAS_AVISO_VENCIMIENTO,
  diasEntre,
  estaVigente,
  presentarSituacion,
  resumirDocumentos,
  type Situacion,
  situacionDe,
  situacionDeTipo,
  situacionesPorTipo,
} from "./situacion"
import type { DocumentoCargado } from "./tipos"

const HOY = "2026-10-22"

let secuencia = 0

function documento(cambios: Partial<DocumentoCargado> = {}): DocumentoCargado {
  secuencia += 1
  return {
    id: `doc-${secuencia}`,
    tipo: "CEDULA_FRENTE",
    estado: "PENDIENTE",
    metodo: "ARCHIVO",
    observaciones: null,
    venceEl: null,
    cargadoAt: "2026-10-01T15:00:00Z",
    revisadoAt: null,
    formato: "image/webp",
    ...cambios,
  }
}

describe("diasEntre", () => {
  it("cuenta días de calendario (negativo si ya pasó)", () => {
    expect(diasEntre(HOY, HOY)).toBe(0)
    expect(diasEntre(HOY, "2026-10-23")).toBe(1)
    expect(diasEntre(HOY, "2026-11-21")).toBe(30)
    expect(diasEntre(HOY, "2026-10-20")).toBe(-2)
  })

  it("no se desvía al cruzar el cambio de año", () => {
    expect(diasEntre("2026-12-31", "2027-01-01")).toBe(1)
  })
})

describe("estaVigente", () => {
  it("vale el aprobado sin vencimiento o que vence desde hoy", () => {
    expect(estaVigente(documento({ estado: "APROBADO" }), HOY)).toBe(true)
    expect(
      estaVigente(documento({ estado: "APROBADO", venceEl: HOY }), HOY)
    ).toBe(true)
    expect(
      estaVigente(documento({ estado: "APROBADO", venceEl: "2026-10-21" }), HOY)
    ).toBe(false)
  })

  it("lo pendiente, rechazado o vencido no vale", () => {
    for (const estado of ["PENDIENTE", "RECHAZADO", "VENCIDO"] as const) {
      expect(estaVigente(documento({ estado }), HOY)).toBe(false)
    }
  })
})

describe("situacionDe", () => {
  it("sin cargas falta", () => {
    expect(situacionDe([], HOY)).toEqual({ tipo: "falta" })
  })

  it("la carga más reciente pendiente está en revisión (sin aprobado previo)", () => {
    const pendiente = documento()
    expect(situacionDe([pendiente], HOY)).toEqual({
      tipo: "en-revision",
      documento: pendiente,
      vigente: null,
    })
  })

  it("un reemplazo en revisión conserva el aprobado vigente", () => {
    const aprobado = documento({
      estado: "APROBADO",
      cargadoAt: "2026-09-01T12:00:00Z",
    })
    const reemplazo = documento({ cargadoAt: "2026-10-20T12:00:00Z" })
    // En cualquier orden: se ordena por fecha de carga.
    expect(situacionDe([aprobado, reemplazo], HOY)).toEqual({
      tipo: "en-revision",
      documento: reemplazo,
      vigente: aprobado,
    })
  })

  it("aprobado: días para vencer y aviso dentro del margen", () => {
    const lejos = documento({ estado: "APROBADO", venceEl: "2027-10-22" })
    const cerca = documento({ estado: "APROBADO", venceEl: "2026-11-01" })
    const sinFecha = documento({ estado: "APROBADO" })
    expect(situacionDe([lejos], HOY)).toMatchObject({
      tipo: "aprobado",
      diasParaVencer: 365,
      porVencer: false,
    })
    expect(situacionDe([cerca], HOY)).toMatchObject({
      tipo: "aprobado",
      diasParaVencer: 10,
      porVencer: true,
    })
    expect(situacionDe([sinFecha], HOY)).toMatchObject({
      tipo: "aprobado",
      diasParaVencer: null,
      porVencer: false,
      reemplazoRechazado: null,
    })
  })

  it(`el aviso empieza a ${DIAS_AVISO_VENCIMIENTO} días`, () => {
    const justo = documento({
      estado: "APROBADO",
      venceEl: "2026-11-21",
    })
    expect(situacionDe([justo], HOY)).toMatchObject({ porVencer: true })
    const despues = documento({ estado: "APROBADO", venceEl: "2026-11-22" })
    expect(situacionDe([despues], HOY)).toMatchObject({ porVencer: false })
  })

  it("un reemplazo rechazado no tumba el aprobado y se informa", () => {
    const aprobado = documento({
      estado: "APROBADO",
      cargadoAt: "2026-09-01T12:00:00Z",
    })
    const rechazado = documento({
      estado: "RECHAZADO",
      observaciones: "Borrosa",
      cargadoAt: "2026-10-10T12:00:00Z",
    })
    expect(situacionDe([rechazado, aprobado], HOY)).toMatchObject({
      tipo: "aprobado",
      documento: aprobado,
      reemplazoRechazado: rechazado,
    })
  })

  it("un rechazo anterior al aprobado no se informa", () => {
    const rechazado = documento({
      estado: "RECHAZADO",
      cargadoAt: "2026-08-01T12:00:00Z",
    })
    const aprobado = documento({
      estado: "APROBADO",
      cargadoAt: "2026-09-01T12:00:00Z",
    })
    expect(situacionDe([rechazado, aprobado], HOY)).toMatchObject({
      tipo: "aprobado",
      reemplazoRechazado: null,
    })
  })

  it("rechazado sin aprobado vigente pide cargarlo de nuevo", () => {
    const rechazado = documento({ estado: "RECHAZADO" })
    expect(situacionDe([rechazado], HOY)).toEqual({
      tipo: "rechazado",
      documento: rechazado,
    })
  })

  it("vencido por el proceso diario o por fecha (aún sin marcar)", () => {
    const marcado = documento({ estado: "VENCIDO", venceEl: "2026-10-01" })
    const sinMarcar = documento({ estado: "APROBADO", venceEl: "2026-10-21" })
    expect(situacionDe([marcado], HOY)).toEqual({
      tipo: "vencido",
      documento: marcado,
    })
    expect(situacionDe([sinMarcar], HOY)).toEqual({
      tipo: "vencido",
      documento: sinMarcar,
    })
  })
})

describe("situacionesPorTipo", () => {
  it("agrupa por tipo y los tipos sin carga faltan", () => {
    const situaciones = situacionesPorTipo(
      [
        documento({ tipo: "RUT", estado: "APROBADO" }),
        documento({ tipo: "CEDULA_FRENTE" }),
      ],
      HOY
    )
    expect(situacionDeTipo(situaciones, "RUT").tipo).toBe("aprobado")
    expect(situacionDeTipo(situaciones, "CEDULA_FRENTE").tipo).toBe(
      "en-revision"
    )
    expect(situacionDeTipo(situaciones, "CAMARA_COMERCIO")).toEqual({
      tipo: "falta",
    })
  })
})

describe("resumirDocumentos", () => {
  const exigidos = [
    "CEDULA_FRENTE",
    "CEDULA_REVERSO",
    "PRUEBA_VIDA",
    "CERT_BANCARIA",
  ] as const

  it("cuenta cada situación de lo exigido", () => {
    const situaciones = situacionesPorTipo(
      [
        documento({ tipo: "CEDULA_FRENTE", estado: "APROBADO" }),
        documento({ tipo: "CEDULA_REVERSO", estado: "RECHAZADO" }),
        documento({ tipo: "CERT_BANCARIA" }),
        // Fuera de lo exigido: no cuenta.
        documento({ tipo: "RUT", estado: "RECHAZADO" }),
      ],
      HOY
    )
    expect(resumirDocumentos(exigidos, situaciones)).toEqual({
      total: 4,
      aprobados: 1,
      enRevision: 1,
      porCorregir: 1,
      faltan: 0,
      voluntarios: 1,
      porVencer: 0,
      completo: false,
      todoCargado: false,
    })
  })

  it("la prueba de vida sin cargar no frena el envío, pero sí la verificación", () => {
    const situaciones = situacionesPorTipo(
      [
        documento({ tipo: "CEDULA_FRENTE", estado: "APROBADO" }),
        documento({ tipo: "CEDULA_REVERSO" }),
        documento({ tipo: "CERT_BANCARIA", estado: "APROBADO" }),
      ],
      HOY
    )
    const resumen = resumirDocumentos(exigidos, situaciones)
    expect(resumen).toMatchObject({ voluntarios: 1, faltan: 0 })
    expect(resumen.todoCargado).toBe(true)
    expect(resumen.completo).toBe(false)
  })

  it("la prueba de vida rechazada pide corregirla, pero tampoco frena el envío", () => {
    const situaciones = situacionesPorTipo(
      [
        documento({ tipo: "CEDULA_FRENTE", estado: "APROBADO" }),
        documento({ tipo: "CEDULA_REVERSO" }),
        documento({ tipo: "PRUEBA_VIDA", estado: "RECHAZADO" }),
        documento({ tipo: "CERT_BANCARIA", estado: "APROBADO" }),
      ],
      HOY
    )
    const resumen = resumirDocumentos(exigidos, situaciones)
    expect(resumen).toMatchObject({ porCorregir: 1, voluntarios: 0 })
    expect(resumen.todoCargado).toBe(true)
    expect(resumen.completo).toBe(false)
  })

  it("todo aprobado y vigente (también por videollamada) está completo", () => {
    const situaciones = situacionesPorTipo(
      [
        documento({ tipo: "CEDULA_FRENTE", estado: "APROBADO" }),
        documento({ tipo: "CEDULA_REVERSO", estado: "APROBADO" }),
        documento({
          tipo: "PRUEBA_VIDA",
          estado: "APROBADO",
          metodo: "VIDEOLLAMADA",
          formato: null,
        }),
        documento({
          tipo: "CERT_BANCARIA",
          estado: "APROBADO",
          venceEl: "2026-11-01",
        }),
      ],
      HOY
    )
    expect(resumirDocumentos(exigidos, situaciones)).toMatchObject({
      aprobados: 4,
      porVencer: 1,
      completo: true,
      todoCargado: true,
    })
  })

  it("un reemplazo en revisión de un aprobado vigente sigue contando como aprobado", () => {
    const situaciones = situacionesPorTipo(
      [
        documento({
          tipo: "CEDULA_FRENTE",
          estado: "APROBADO",
          cargadoAt: "2026-09-01T12:00:00Z",
        }),
        documento({ tipo: "CEDULA_FRENTE", cargadoAt: "2026-10-21T12:00:00Z" }),
      ],
      HOY
    )
    expect(resumirDocumentos(["CEDULA_FRENTE"], situaciones)).toMatchObject({
      aprobados: 1,
      enRevision: 0,
      completo: true,
    })
  })

  it("sin datos de pago suma el certificado como faltante", () => {
    const resumen = resumirDocumentos(
      ["CEDULA_FRENTE"],
      situacionesPorTipo(
        [documento({ tipo: "CEDULA_FRENTE", estado: "APROBADO" })],
        HOY
      ),
      { pagoPendiente: true }
    )
    expect(resumen).toMatchObject({
      total: 2,
      aprobados: 1,
      faltan: 1,
      completo: false,
      todoCargado: false,
    })
  })

  it("sin nada exigido no está completo ni listo", () => {
    expect(resumirDocumentos([], new Map())).toMatchObject({
      total: 0,
      completo: false,
      todoCargado: false,
    })
  })
})

describe("presentarSituacion", () => {
  const aprobado = (
    cambios: Partial<Extract<Situacion, { tipo: "aprobado" }>>
  ) =>
    ({
      tipo: "aprobado",
      documento: documento({ estado: "APROBADO" }),
      diasParaVencer: null,
      porVencer: false,
      reemplazoRechazado: null,
      ...cambios,
    }) satisfies Situacion

  it("lo que falta pide cargarlo, salvo lo voluntario", () => {
    expect(presentarSituacion({ tipo: "falta" })).toEqual({
      etiqueta: "Sin cargar",
      tono: "neutro",
      accion: "cargar",
      requiereAccion: true,
    })
    expect(presentarSituacion({ tipo: "falta" }, { voluntario: true })).toEqual(
      {
        etiqueta: "Opcional",
        tono: "neutro",
        accion: "cargar",
        requiereAccion: false,
      }
    )
  })

  it("en revisión se puede reemplazar sin pedir atención", () => {
    const enRevision = presentarSituacion({
      tipo: "en-revision",
      documento: documento(),
      vigente: null,
    })
    expect(enRevision).toMatchObject({
      etiqueta: "En revisión",
      tono: "info",
      accion: "reemplazar",
      requiereAccion: false,
    })
    expect(
      presentarSituacion({
        tipo: "en-revision",
        documento: documento(),
        vigente: documento({ estado: "APROBADO" }),
      }).etiqueta
    ).toBe("Reemplazo en revisión")
  })

  it("aprobado: éxito, o aviso con los días cuando está por vencer", () => {
    expect(presentarSituacion(aprobado({}))).toMatchObject({
      etiqueta: "Aprobado",
      tono: "exito",
      accion: "reemplazar",
      requiereAccion: false,
    })
    expect(
      presentarSituacion(aprobado({ porVencer: true, diasParaVencer: 12 }))
    ).toMatchObject({
      etiqueta: "Vence en 12 días",
      tono: "aviso",
      requiereAccion: true,
    })
    expect(
      presentarSituacion(aprobado({ porVencer: true, diasParaVencer: 1 }))
        .etiqueta
    ).toBe("Vence mañana")
    expect(
      presentarSituacion(aprobado({ porVencer: true, diasParaVencer: 0 }))
        .etiqueta
    ).toBe("Vence hoy")
  })

  it("una videollamada aprobada no tiene archivo que reemplazar (hasta que esté por vencer)", () => {
    const porVideollamada = documento({
      tipo: "PRUEBA_VIDA",
      estado: "APROBADO",
      metodo: "VIDEOLLAMADA",
    })
    expect(
      presentarSituacion(aprobado({ documento: porVideollamada })).accion
    ).toBeNull()
    expect(
      presentarSituacion(
        aprobado({
          documento: porVideollamada,
          porVencer: true,
          diasParaVencer: 5,
        })
      ).accion
    ).toBe("reemplazar")
  })

  it("rechazado y vencido piden cargarlo de nuevo", () => {
    for (const tipo of ["rechazado", "vencido"] as const) {
      expect(
        presentarSituacion({ tipo, documento: documento() })
      ).toMatchObject({
        tono: "peligro",
        accion: "cargar-de-nuevo",
        requiereAccion: true,
      })
    }
  })
})
