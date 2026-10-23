import { describe, expect, it } from "vitest"

import {
  reglasEdicion,
  reglasNuevaCampana,
  valoresEdicion,
} from "./formularios"
import type { MiCampana } from "./tipos"

const CAMPANA: MiCampana = {
  id: "0199f3a0-0000-7000-8000-00000000ca01",
  nombre: "Temporada navideña 2026",
  marca: "Café Sierra Alta",
  objetivo: null,
  anuncianteId: "0199f3a0-0000-7000-8000-00000000a001",
  estado: "ACTIVA",
  fechaInicio: "2026-10-01",
  fechaFin: "2026-12-31",
  presupuestoTotal: 25_000_000,
  presupuestoComprometido: 1_200_000,
  disponible: 15_000_000,
  activadaAt: "2026-10-01T15:00:00Z",
  finalizadaAt: null,
  canceladaAt: null,
  creadaAt: "2026-09-28T15:00:00Z",
  actualizadaAt: "2026-10-21T15:00:00.123456+00:00",
  esDemo: false,
}

describe("formularios de campaña", () => {
  it("los valores de la edición van como se escriben (cifra en es-CO, objetivo vacío)", () => {
    expect(valoresEdicion(CAMPANA)).toEqual({
      campanaId: CAMPANA.id,
      actualizadoAt: CAMPANA.actualizadaAt,
      nombre: "Temporada navideña 2026",
      marca: "Café Sierra Alta",
      objetivo: "",
      fechaInicio: "2026-10-01",
      fechaFin: "2026-12-31",
      presupuesto: "25.000.000",
    })
  })

  it("una campaña nueva solo depende del día de hoy", () => {
    expect(reglasNuevaCampana("2026-10-22")).toEqual({
      hoy: "2026-10-22",
      presupuestoMinimo: 0,
    })
  })

  it("la edición suma el piso del presupuesto y las ventanas de las ofertas vivas", () => {
    expect(
      reglasEdicion(
        CAMPANA,
        [
          {
            estado: "PUBLICADA",
            ventanaInicio: "2026-11-02T05:00:00Z",
            ventanaFin: "2026-11-25T15:00:00Z",
          },
        ],
        "2026-10-22"
      )
    ).toEqual({
      hoy: "2026-10-22",
      presupuestoMinimo: 10_000_000,
      fechaInicioActual: "2026-10-01",
      fechaFinActual: "2026-12-31",
      inicioMaximo: "2026-11-02",
      finMinimo: "2026-11-25",
    })
  })
})
