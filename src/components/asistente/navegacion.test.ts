import { describe, expect, it } from "vitest"

import {
  alcanceInicial,
  avanzar,
  estadoPaso,
  exigeValidacion,
  fraccionProgreso,
  indiceDe,
  type InfoPaso,
  pasoVisible,
  puedeIrA,
  retroceder,
  saltarA,
  textoPaso,
} from "./navegacion"

const IDS = ["que", "quien", "cuando", "cuanto", "revision"] as const

/** Lo que hace el asistente al abrir con `?paso=`: el pedido, sin pasar de lo alcanzado. */
function pasoAlAbrir(solicitado: string | null, pasos: readonly InfoPaso[]) {
  return pasoVisible(indiceDe(IDS, solicitado), alcanceInicial(pasos))
}

describe("apertura del asistente", () => {
  it("sin datos previos solo se puede estar en el primer paso", () => {
    const pasos = IDS.map(() => ({}))
    expect(alcanceInicial(pasos)).toBe(0)
    expect(pasoAlAbrir("cuanto", pasos)).toBe(0)
  })

  it("un borrador con pasos completos abre hasta el primero pendiente", () => {
    const pasos = [{ completo: true }, { completo: true }, {}, {}, {}]
    expect(alcanceInicial(pasos)).toBe(2)
    // Lo pedido en la URL se respeta si ya es alcanzable…
    expect(pasoAlAbrir("quien", pasos)).toBe(1)
    // …y se recorta al primer pendiente si no.
    expect(pasoAlAbrir("revision", pasos)).toBe(2)
  })

  it("un paso completo después de uno pendiente no abre nada más", () => {
    expect(alcanceInicial([{ completo: true }, {}, { completo: true }])).toBe(1)
  })

  it("con todo completo se puede abrir directo en la revisión", () => {
    const pasos = IDS.map(() => ({ completo: true }))
    expect(alcanceInicial(pasos)).toBe(4)
    expect(pasoAlAbrir("revision", pasos)).toBe(4)
  })

  it("un paso desconocido en la URL abre el primero", () => {
    expect(indiceDe(IDS, "otro")).toBe(-1)
    expect(indiceDe(IDS, null)).toBe(-1)
    expect(indiceDe(IDS, "")).toBe(-1)
    expect(pasoVisible(-1, 3)).toBe(0)
    expect(
      pasoAlAbrir(
        "otro",
        IDS.map(() => ({ completo: true }))
      )
    ).toBe(0)
  })

  it("sin pasos no falla", () => {
    expect(alcanceInicial([])).toBe(0)
  })
})

describe("movimientos", () => {
  it("avanzar amplía lo alcanzado y no pasa del último", () => {
    expect(avanzar({ actual: 0, alcanzado: 0 }, 5)).toEqual({
      actual: 1,
      alcanzado: 1,
    })
    expect(avanzar({ actual: 1, alcanzado: 3 }, 5)).toEqual({
      actual: 2,
      alcanzado: 3,
    })
    expect(avanzar({ actual: 4, alcanzado: 4 }, 5)).toEqual({
      actual: 4,
      alcanzado: 4,
    })
  })

  it("retroceder conserva lo alcanzado y no baja de cero", () => {
    expect(retroceder({ actual: 3, alcanzado: 3 })).toEqual({
      actual: 2,
      alcanzado: 3,
    })
    expect(retroceder({ actual: 0, alcanzado: 2 })).toEqual({
      actual: 0,
      alcanzado: 2,
    })
  })

  it("saltar solo llega a pasos ya alcanzados", () => {
    const estado = { actual: 1, alcanzado: 3 }
    expect(puedeIrA(estado, 3, 5)).toBe(true)
    expect(puedeIrA(estado, 4, 5)).toBe(false)
    expect(puedeIrA(estado, -1, 5)).toBe(false)
    expect(puedeIrA(estado, 1.5, 5)).toBe(false)
    expect(saltarA(estado, 0, 5)).toEqual({ actual: 0, alcanzado: 3 })
    expect(saltarA(estado, 4, 5)).toBe(estado)
  })

  it("solo ir hacia adelante exige validar el paso actual", () => {
    const estado = { actual: 2, alcanzado: 3 }
    expect(exigeValidacion(estado, 3)).toBe(true)
    expect(exigeValidacion(estado, 1)).toBe(false)
    expect(exigeValidacion(estado, 2)).toBe(false)
  })
})

describe("estado de cada paso en el indicador", () => {
  const estado = { actual: 1, alcanzado: 3 }

  it("distingue actual, completado, disponible y bloqueado", () => {
    expect(estadoPaso(0, estado)).toBe("completado")
    expect(estadoPaso(1, estado)).toBe("actual")
    expect(estadoPaso(2, estado)).toBe("completado")
    expect(estadoPaso(3, estado)).toBe("disponible")
    expect(estadoPaso(4, estado)).toBe("bloqueado")
  })

  it("un paso que dejó de estar completo vuelve a «disponible»", () => {
    expect(estadoPaso(0, estado, { completo: false })).toBe("disponible")
  })
})

describe("progreso", () => {
  it("cuenta el paso actual y llega a 1 en el último", () => {
    expect(fraccionProgreso(0, 5)).toBe(0.2)
    expect(fraccionProgreso(2, 5)).toBe(0.6)
    expect(fraccionProgreso(4, 5)).toBe(1)
    expect(fraccionProgreso(0, 1)).toBe(1)
  })

  it("nombra el paso en lenguaje claro", () => {
    expect(textoPaso(1, 6)).toBe("Paso 2 de 6")
  })
})
