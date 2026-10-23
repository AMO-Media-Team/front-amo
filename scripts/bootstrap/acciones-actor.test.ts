// @vitest-environment node
import { describe, expect, it } from "vitest"

import { errorDeApi } from "./acciones-actor"
import { ErrorBootstrap } from "./supabase"

describe("errorDeApi", () => {
  it("lleva la acción, el código de la BD, su detalle legible y la pista", () => {
    const error = errorDeApi("No se pudo pasar ofertas x a EN_REVISION", {
      message: "AMO_TRANSICION_INVALIDA",
      details: "Carga el paquete creativo con al menos un archivo.",
      hint: "envio_oferta:creativo",
    })
    expect(error).toBeInstanceOf(ErrorBootstrap)
    expect(error.message).toBe(
      "No se pudo pasar ofertas x a EN_REVISION: AMO_TRANSICION_INVALIDA (Carga el paquete creativo con al menos un archivo.) [envio_oferta:creativo]"
    )
  })

  it("omite el detalle y la pista cuando no vienen", () => {
    expect(
      errorDeApi("Leer", { message: "falló", details: null }).message
    ).toBe("Leer: falló")
  })
})
