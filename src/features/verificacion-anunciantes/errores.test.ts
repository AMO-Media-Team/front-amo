import { describe, expect, it } from "vitest"

import { interpretarErrorVerificacionAnunciante } from "./errores"

describe("interpretarErrorVerificacionAnunciante", () => {
  it("muestra tal cual el detalle de la BD al verificar sin documentos", () => {
    expect(
      interpretarErrorVerificacionAnunciante({
        code: "P0001",
        message: "AMO_TRANSICION_INVALIDA",
        details:
          "Faltan documentos aprobados y vigentes: RUT, Cámara de Comercio.",
      })
    ).toEqual({
      codigo: "AMO_TRANSICION_INVALIDA",
      esperado: true,
      mensaje:
        "Faltan documentos aprobados y vigentes: RUT, Cámara de Comercio.",
    })
  })

  it("el motivo demasiado largo se marca en su campo", () => {
    expect(
      interpretarErrorVerificacionAnunciante({
        code: "23514",
        message:
          'new row for relation "anunciantes" violates check constraint "anunciantes_motivo_estado_chk"',
      })
    ).toMatchObject({ campo: "motivo", esperado: true })
  })

  it("una ruta repetida al registrar la carga es un error conocido", () => {
    expect(
      interpretarErrorVerificacionAnunciante({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "documentos_anunciante_archivo_path_key"',
      })
    ).toMatchObject({
      esperado: true,
      mensaje:
        "Este archivo ya estaba registrado. Actualiza la página para verlo.",
    })
  })

  it("un error desconocido no filtra el mensaje técnico", () => {
    const interpretado = interpretarErrorVerificacionAnunciante({
      code: "XX000",
      message: "relation documentos_anunciante: algo interno",
    })
    expect(interpretado.esperado).toBe(false)
    expect(interpretado.mensaje).not.toMatch(/relation/)
  })
})
