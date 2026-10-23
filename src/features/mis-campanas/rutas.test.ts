import { describe, expect, it } from "vitest"

import { rutaFichaOfertaMedio } from "@/features/marketplace/rutas"

import {
  rutaAsignacionMedio,
  rutaContenido,
  rutaEvidencia,
  rutaMetricas,
} from "./rutas"

const ID = "0199f3a0-0000-7000-8000-00000000a501"

describe("rutas de la pauta del medio", () => {
  it("coinciden con las de /ir y las pantallas de ejecución", () => {
    expect(rutaAsignacionMedio(ID)).toBe(`/mis-campanas/${ID}`)
    expect(rutaContenido(ID)).toBe(`/mis-campanas/${ID}/contenido`)
    expect(rutaEvidencia(ID)).toBe(`/mis-campanas/${ID}/evidencia`)
    expect(rutaEvidencia(ID, 2)).toBe(`/mis-campanas/${ID}/evidencia?numero=2`)
    expect(rutaMetricas(ID, 1, "H72")).toBe(
      `/mis-campanas/${ID}/metricas?numero=1&corte=H72`
    )
    expect(rutaFichaOfertaMedio(ID)).toBe(`/ofertas/${ID}`)
  })
})
