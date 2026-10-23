import { describe, expect, it } from "vitest"

import { idTarjetaAsignacion, rutaSeguimiento } from "./rutas"

const CAMPANA = "0199f3a0-0000-7000-8000-00000000ca01"
const ASIGNACION = "01a16693-73ac-737c-acec-451c31ed4077"

describe("rutas del seguimiento", () => {
  it("es el destino que usa /ir para el anunciante", () => {
    expect(rutaSeguimiento(CAMPANA)).toBe(
      `/campanas/${CAMPANA}?pestana=seguimiento`
    )
    expect(rutaSeguimiento(CAMPANA, ASIGNACION)).toBe(
      `/campanas/${CAMPANA}?pestana=seguimiento&asignacion=${ASIGNACION}`
    )
  })

  it("cada tarjeta tiene un ancla estable", () => {
    expect(idTarjetaAsignacion(ASIGNACION)).toBe(`asignacion-${ASIGNACION}`)
  })
})
