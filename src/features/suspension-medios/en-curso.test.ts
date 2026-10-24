import { describe, expect, it } from "vitest"

import {
  asignacionEnCurso,
  avisoResultadoSuspension,
  type FilaEnCurso,
  ordenarEnCurso,
  resumirEnCurso,
  situacionEnCurso,
  textoResumenEnCurso,
} from "./en-curso"

function fila(cambios: Partial<FilaEnCurso> = {}): FilaEnCurso {
  return {
    id: "0192f3a4-0000-7000-8000-000000000001",
    estado: "ACEPTADA",
    estado_previo_disputa: null,
    oferta_id: "0192f3a4-0000-7000-8000-0000000000aa",
    oferta_titulo: "Lanzamiento de temporada",
    anunciante: "Café del Sur",
    // 10 de octubre de 2026, 5:00 p. m. en Bogotá.
    fecha_limite_publicacion: "2026-10-10T22:00:00Z",
    monto_bruto: 480000,
    disputa_abierta_id: null,
    cancelable: true,
    ...cambios,
  }
}

describe("asignacionEnCurso", () => {
  it("toma la fila de la RPC y completa los nombres que faltan", () => {
    const asignacion = asignacionEnCurso(
      fila({ oferta_titulo: "  ", anunciante: null })
    )
    expect(asignacion).toMatchObject({
      oferta: "Oferta sin título",
      anunciante: "Anunciante sin nombre visible",
      montoBruto: 480000,
      cancelable: true,
    })
  })

  it("sin el dato de la BD, una en disputa no se cancela desde su ficha", () => {
    expect(
      asignacionEnCurso(fila({ estado: "EN_DISPUTA", cancelable: null }))
        .cancelable
    ).toBe(false)
    expect(asignacionEnCurso(fila({ cancelable: null })).cancelable).toBe(true)
  })
})

describe("ordenarEnCurso y resumirEnCurso", () => {
  const lista = [
    asignacionEnCurso(
      fila({
        id: "c",
        estado: "EN_DISPUTA",
        cancelable: false,
        fecha_limite_publicacion: "2026-10-01T00:00:00Z",
      })
    ),
    asignacionEnCurso(
      fila({ id: "b", fecha_limite_publicacion: "2026-10-20T00:00:00Z" })
    ),
    asignacionEnCurso(fila({ id: "d", fecha_limite_publicacion: null })),
    asignacionEnCurso(
      fila({ id: "a", fecha_limite_publicacion: "2026-10-05T00:00:00Z" })
    ),
  ]

  it("pone primero las que se deciden en su ficha, la de plazo más próximo arriba", () => {
    expect(ordenarEnCurso(lista).map((asignacion) => asignacion.id)).toEqual([
      "a",
      "b",
      "d",
      "c",
    ])
  })

  it("cuenta las cancelables y las que esperan su disputa", () => {
    expect(resumirEnCurso(lista)).toEqual({
      total: 4,
      cancelables: 3,
      enDisputa: 1,
    })
    expect(resumirEnCurso([])).toEqual({
      total: 0,
      cancelables: 0,
      enDisputa: 0,
    })
  })
})

describe("situacionEnCurso", () => {
  it("antes de publicar dice el plazo en la hora de Bogotá", () => {
    expect(situacionEnCurso(asignacionEnCurso(fila()))).toMatch(
      /^Aún no descarga el contenido · publica hasta el 10 de oct\.? de 2026, 5:00/
    )
    expect(
      situacionEnCurso(
        asignacionEnCurso(
          fila({
            estado: "CONTENIDO_ENTREGADO",
            fecha_limite_publicacion: null,
          })
        )
      )
    ).toBe("Descargó el contenido")
  })

  it("explica que una verificada se liquida y que una en disputa espera su resolución", () => {
    expect(
      situacionEnCurso(asignacionEnCurso(fila({ estado: "VERIFICADA" })))
    ).toBe("Verificada: se liquida aunque el medio esté suspendido")
    expect(
      situacionEnCurso(asignacionEnCurso(fila({ estado: "EN_DISPUTA" })))
    ).toBe("En disputa: se decide al resolverla")
  })
})

describe("textos del resultado", () => {
  it("sin asignaciones en curso, la suspensión solo impide aceptar nuevas", () => {
    const vacio = { total: 0, cancelables: 0, enDisputa: 0 }
    expect(textoResumenEnCurso(vacio)).toMatch(
      /^No tiene asignaciones en curso/
    )
    expect(avisoResultadoSuspension(vacio)).toBe(
      "No tenía asignaciones en curso."
    )
  })

  it("con una, habla en singular", () => {
    const una = { total: 1, cancelables: 1, enDisputa: 0 }
    expect(textoResumenEnCurso(una)).toBe(
      "Tiene 1 asignación en curso. Ábrela para decidir si la cancelas con su causa; si no, el medio puede seguir cumpliéndola."
    )
    expect(avisoResultadoSuspension(una)).toBe(
      "Queda 1 asignación en curso: revísala en la ficha para decidir si se cancela."
    )
  })

  it("con varias, separa las que están en disputa", () => {
    const varias = { total: 4, cancelables: 2, enDisputa: 2 }
    expect(textoResumenEnCurso(varias)).toBe(
      "Tiene 4 asignaciones en curso. Abre cada una para decidir si la cancelas con su causa; las que no canceles, el medio puede seguir cumpliéndolas. 2 están en disputa: se deciden al resolverlas."
    )
    expect(
      textoResumenEnCurso({ total: 1, cancelables: 0, enDisputa: 1 })
    ).toBe(
      "Tiene 1 asignación en curso. Una está en disputa: se decide al resolverla."
    )
    expect(avisoResultadoSuspension(varias)).toBe(
      "Quedan 4 asignaciones en curso: revísalas en la ficha para decidir si se cancelan."
    )
  })

  it("si quien suspende no ve asignaciones, pide que otra persona las revise", () => {
    expect(avisoResultadoSuspension(null)).toMatch(
      /^No puedes ver sus asignaciones/
    )
  })
})
