import { describe, expect, it } from "vitest"

import { rutaAsistente } from "@/features/asistente-oferta/rutas"

import {
  RUTA_MIS_CAMPANAS,
  rutaEditarCampana,
  rutaMiCampana,
  rutaMisCampanasEn,
} from "./rutas"

const CAMPANA = "0199f3a0-0000-7000-8000-00000000ca01"

describe("rutas de campañas", () => {
  it("las fichas son las mismas que usa el resolvedor /ir", () => {
    expect(rutaMiCampana(CAMPANA)).toBe(`/campanas/${CAMPANA}`)
    expect(rutaMiCampana(CAMPANA, "ofertas")).toBe(
      `/campanas/${CAMPANA}?pestana=ofertas`
    )
    expect(rutaEditarCampana(CAMPANA)).toBe(`/campanas/${CAMPANA}/editar`)
  })

  it("el listado filtrado usa el mismo parámetro que la tabla", () => {
    expect(rutaMisCampanasEn("ACTIVA")).toBe(
      `${RUTA_MIS_CAMPANAS}?estado=ACTIVA`
    )
  })

  it("el asistente de oferta cuelga de la campaña", () => {
    expect(rutaAsistente(CAMPANA)).toBe(`/campanas/${CAMPANA}/ofertas/nueva`)
  })
})
