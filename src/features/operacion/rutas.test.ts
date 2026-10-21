import { describe, expect, it } from "vitest"

import {
  rutaAsignacion,
  rutaAsignacionesDe,
  rutaAsignacionesGrupo,
  rutaCampanasDe,
  rutaMedio,
} from "./rutas"

const ID = "0192f0a1-7b2c-7d3e-8f40-123456789abc"

function parametros(ruta: string): URLSearchParams {
  return new URL(ruta, "https://amo.test").searchParams
}

describe("rutas de operación", () => {
  it("fichas", () => {
    expect(rutaMedio(ID)).toBe(`/operacion/medios/${ID}`)
    expect(rutaAsignacion(ID)).toBe(`/operacion/asignaciones/${ID}`)
  })

  it("asignaciones de un dueño, opcionalmente por grupo de estados", () => {
    expect(parametros(rutaAsignacionesDe("medio", ID)).get("medio")).toBe(ID)
    const porGrupo = parametros(
      rutaAsignacionesDe("campana", ID, { grupo: "por_revisar" })
    )
    expect(porGrupo.get("campana")).toBe(ID)
    expect(porGrupo.get("estado")).toBe("PUBLICADA,METRICAS_CARGADAS")
    expect(
      parametros(
        rutaAsignacionesDe("anunciante", ID, { estados: ["EN_DISPUTA"] })
      ).get("estado")
    ).toBe("EN_DISPUTA")
  })

  it("listados filtrados con los mismos parsers de la tabla", () => {
    expect(rutaAsignacionesGrupo("caidas")).toMatch(
      /^\/operacion\/asignaciones\?/
    )
    expect(parametros(rutaAsignacionesGrupo("caidas")).get("estado")).toBe(
      "RECHAZADA,VENCIDA_SIN_PUBLICAR,CANCELADA"
    )
    expect(parametros(rutaCampanasDe(ID)).get("anunciante")).toBe(ID)
  })
})
