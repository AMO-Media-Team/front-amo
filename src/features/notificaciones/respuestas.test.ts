import { describe, expect, it } from "vitest"

import {
  conteoDesdeRespuesta,
  notificacionesDesdeRespuesta,
} from "./respuestas"

const fila = {
  id: 3,
  tipo: "liquidacion.pagada",
  titulo: "Pagamos tu liquidación",
  mensaje: "Ya está en tu cuenta.",
  url: "/cuenta/perfil",
  prioridad: 0,
  leida: true,
  created_at: "2026-09-30T15:00:00Z",
}

describe("conteoDesdeRespuesta", () => {
  it("devuelve el conteo exacto, incluido el cero", () => {
    expect(conteoDesdeRespuesta({ count: 4, error: null })).toEqual({
      disponible: true,
      total: 4,
    })
    expect(conteoDesdeRespuesta({ count: 0, error: null })).toEqual({
      disponible: true,
      total: 0,
    })
  })

  it("sin la tabla (HEAD sin conteo o PGRST205) queda «no disponible»", () => {
    const noDisponible = { disponible: false, total: 0 }
    expect(conteoDesdeRespuesta({ count: null, error: null })).toEqual(
      noDisponible
    )
    expect(conteoDesdeRespuesta({ count: null, error: { code: "" } })).toEqual(
      noDisponible
    )
    expect(
      conteoDesdeRespuesta({ count: null, error: { code: "PGRST205" } })
    ).toEqual(noDisponible)
  })

  it("lanza ante otros errores", () => {
    expect(() =>
      conteoDesdeRespuesta({ count: null, error: { code: "42501" } })
    ).toThrow("42501")
  })
})

describe("notificacionesDesdeRespuesta", () => {
  it("valida y convierte las filas", () => {
    expect(
      notificacionesDesdeRespuesta({ data: [fila], error: null })
    ).toMatchObject([{ id: 3, leida: true, creadaAt: fila.created_at }])
  })

  it("`null` si la tabla no existe; lanza ante otros errores", () => {
    expect(
      notificacionesDesdeRespuesta({ data: null, error: { code: "42P01" } })
    ).toBeNull()
    expect(() =>
      notificacionesDesdeRespuesta({ data: null, error: { code: "57014" } })
    ).toThrow("57014")
  })

  it("rechaza filas con otra forma", () => {
    expect(() =>
      notificacionesDesdeRespuesta({ data: [{ id: "x" }], error: null })
    ).toThrow()
  })
})
