import { describe, expect, it } from "vitest"

import { entradaVacia, filaKpi } from "../fixtures"
import type { VencidasPeriodo } from "../tipos"
import { reglaCumplimiento } from "./cumplimiento"

const VENCIDAS: VencidasPeriodo = {
  total: 9,
  porDepartamento: [
    { clave: "23", nombre: "Córdoba", cantidad: 4 },
    { clave: "05", nombre: "Antioquia", cantidad: 3 },
    { clave: "08", nombre: "Atlántico", cantidad: 2 },
  ],
  porMedio: [
    { clave: "m3", nombre: "Radio Sinú", cantidad: 2 },
    { clave: "m1", nombre: "El Meridiano", cantidad: 3 },
    { clave: "m2", nombre: "Caribe al Día", cantidad: 2 },
    { clave: "m4", nombre: "Zeta Noticias", cantidad: 2 },
    { clave: "m5", nombre: "Sin vencidas", cantidad: 0 },
  ],
}

function entrada(valor: number | null, anterior: number | null, extra = {}) {
  return entradaVacia({
    kpis: [
      filaKpi("tasa_cumplimiento", valor, anterior, {
        unidad: "%",
        n: 40,
        ...extra,
      }),
    ],
    vencidas: VENCIDAS,
  })
}

describe("reglaCumplimiento", () => {
  it("dispara con una caída de 5 pp y señala dónde se concentran las vencidas", () => {
    const insight = reglaCumplimiento(entrada(0.87, 0.92))
    expect(insight).toMatchObject({
      id: "cumplimiento",
      regla: 2,
      severidad: "atencion",
      titulo: "El cumplimiento cayó a 87,0%",
      metrica: "tasa_cumplimiento",
      valor: 0.87,
    })
    expect(insight?.detalle).toBe(
      "Bajó 5,0 pp frente al periodo anterior. 9 asignaciones vencieron sin publicar; Córdoba concentra 4. " +
        "Medios con más vencidas: El Meridiano (3), Caribe al Día (2) y Radio Sinú (2)."
    )
    expect(insight?.accion?.href).toBe(
      "/reportes/cumplimiento-medios?departamento=23&desde=2026-09-01&hasta=2026-09-30"
    )
  })

  it("una caída menor de 5 pp sobre el piso no dispara", () => {
    expect(reglaCumplimiento(entrada(0.88, 0.929))).toBeNull()
  })

  it("bajo el 85 % dispara aunque no haya caído", () => {
    const insight = reglaCumplimiento(entrada(0.84, 0.83))
    expect(insight?.titulo).toBe("El cumplimiento está en 84,0%")
    expect(
      insight?.detalle.startsWith("Está por debajo del 85% (meta: 90%).")
    ).toBe(true)
    expect(reglaCumplimiento(entrada(0.84, null))?.severidad).toBe("atencion")
  })

  it("bajo el 75 % es crítico", () => {
    expect(reglaCumplimiento(entrada(0.74, 0.9))?.severidad).toBe("critico")
    expect(reglaCumplimiento(entrada(0.75, 0.9))?.severidad).toBe("atencion")
  })

  it("exige muestra mínima y al menos 3 vencidas", () => {
    expect(reglaCumplimiento(entrada(0.7, 0.9, { n: 19 }))).toBeNull()
    expect(reglaCumplimiento(entrada(0.7, 0.9, { n: 20 }))).not.toBeNull()
    const pocas = { ...entrada(0.7, 0.9), vencidas: { ...VENCIDAS, total: 2 } }
    expect(reglaCumplimiento(pocas)).toBeNull()
    const exactas = {
      ...entrada(0.7, 0.9),
      vencidas: { ...VENCIDAS, total: 3 },
    }
    expect(reglaCumplimiento(exactas)).not.toBeNull()
  })

  it("sin tasa, sin vencidas o sin desglose no inventa", () => {
    expect(reglaCumplimiento(entrada(null, 0.9))).toBeNull()
    expect(reglaCumplimiento(entradaVacia({ vencidas: VENCIDAS }))).toBeNull()
    const sinVencidas = entradaVacia({
      kpis: [filaKpi("tasa_cumplimiento", 0.7, 0.9, { unidad: "%" })],
    })
    expect(reglaCumplimiento(sinVencidas)).toBeNull()

    const sinDesglose = {
      ...entrada(0.7, 0.9),
      vencidas: { total: 5, porDepartamento: [], porMedio: [] },
    }
    const insight = reglaCumplimiento(sinDesglose)
    expect(insight?.detalle).toBe(
      "Bajó 20,0 pp frente al periodo anterior. 5 asignaciones vencieron sin publicar."
    )
    expect(insight?.accion?.href).toBe(
      "/reportes/cumplimiento-medios?desde=2026-09-01&hasta=2026-09-30"
    )
  })

  it("la magnitud crece con la caída", () => {
    const leve = reglaCumplimiento(entrada(0.84, 0.86))
    const fuerte = reglaCumplimiento(entrada(0.7, 0.9))
    expect(fuerte?.magnitud ?? 0).toBeGreaterThan(leve?.magnitud ?? 0)
  })
})
