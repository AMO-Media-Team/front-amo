import { describe, expect, it } from "vitest"

import { ordenarCola, rutaRevisionAnunciante } from "./cola"

const A = "0192f3a4-5b6c-7d8e-9f01-00000000000a"
const B = "0192f3a4-5b6c-7d8e-9f01-00000000000b"
const C = "0192f3a4-5b6c-7d8e-9f01-00000000000c"

describe("ordenarCola", () => {
  it("una entrada por empresa con sus documentos por revisar", () => {
    const cola = ordenarCola(
      [{ id: A, enviadoAt: "2026-10-20T10:00:00.000Z" }],
      [
        { anuncianteId: A, subidoAt: "2026-10-19T09:00:00.000Z" },
        { anuncianteId: A, subidoAt: "2026-10-19T09:05:00.000Z" },
      ]
    )
    expect(cola).toEqual([
      {
        anuncianteId: A,
        // Enviada: espera desde su envío, no desde sus documentos.
        desde: "2026-10-20T10:00:00.000Z",
        enviadoAt: "2026-10-20T10:00:00.000Z",
        documentosPorRevisar: 2,
      },
    ])
  })

  it("una empresa sin enviar entra por su documento más antiguo", () => {
    const [entrada] = ordenarCola(
      [],
      [
        { anuncianteId: B, subidoAt: "2026-10-21T12:00:00.000Z" },
        { anuncianteId: B, subidoAt: "2026-10-18T08:00:00.000Z" },
      ]
    )
    expect(entrada).toEqual({
      anuncianteId: B,
      desde: "2026-10-18T08:00:00.000Z",
      enviadoAt: null,
      documentosPorRevisar: 2,
    })
  })

  it("atiende primero lo que más lleva esperando (y a igual instante, por id)", () => {
    const cola = ordenarCola(
      [
        { id: C, enviadoAt: "2026-10-15T00:00:00.000Z" },
        { id: A, enviadoAt: "2026-10-20T00:00:00.000Z" },
      ],
      [
        { anuncianteId: B, subidoAt: "2026-10-15T00:00:00.000Z" },
        { anuncianteId: A, subidoAt: "2026-10-01T00:00:00.000Z" },
      ]
    )
    expect(cola.map((entrada) => entrada.anuncianteId)).toEqual([B, C, A])
  })

  it("sin nada pendiente la cola está vacía", () => {
    expect(ordenarCola([], [])).toEqual([])
  })
})

describe("rutaRevisionAnunciante", () => {
  it("abre la pestaña de verificación de la ficha (contrato de /ir)", () => {
    expect(rutaRevisionAnunciante(A)).toBe(
      `/operacion/anunciantes/${A}?pestana=verificacion`
    )
  })
})
