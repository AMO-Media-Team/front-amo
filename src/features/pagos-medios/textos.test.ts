import { describe, expect, it } from "vitest"

import {
  avisoYaEnArchivo,
  descripcionPedido,
  plural,
  tituloDispersion,
} from "./textos"

describe("plural", () => {
  it("usa singular solo con uno y separa los miles", () => {
    expect(plural(1, "liquidación", "liquidaciones")).toBe("1 liquidación")
    expect(plural(0, "liquidación", "liquidaciones")).toBe("0 liquidaciones")
    expect(plural(1200, "medio", "medios")).toBe("1.200 medios")
  })
})

describe("descripcionPedido", () => {
  it("resume cuántas, de cuántos medios y por cuánto", () => {
    expect(
      descripcionPedido({ ids: ["a", "b", "c"], medios: 2, total: 1_234_567 })
    ).toMatch(/^3 liquidaciones de 2 medios por \$\s?1\.234\.567$/)
  })
})

describe("avisoYaEnArchivo", () => {
  it("con una, en singular y con la fecha de su archivo", () => {
    expect(
      avisoYaEnArchivo({
        yaEnArchivo: [
          { id: "a", medio: "Radio", dispersadaAt: "2026-10-18T17:14:34Z" },
        ],
      })
    ).toBe(
      "Una ya está en el archivo de pagos del 18 oct 2026: confirma con tesorería que el banco no la pagó antes de incluirla otra vez."
    )
  })

  it("con varias de archivos distintos, las fechas (hasta tres)", () => {
    const aviso = avisoYaEnArchivo({
      yaEnArchivo: [
        { id: "a", medio: "A", dispersadaAt: "2026-10-03T12:00:00Z" },
        { id: "b", medio: "B", dispersadaAt: "2026-10-10T12:00:00Z" },
        { id: "c", medio: "C", dispersadaAt: "2026-10-10T15:00:00Z" },
      ],
    })
    expect(aviso).toBe(
      "3 ya están en archivos de pagos anteriores (3 oct 2026, 10 oct 2026): confirma con tesorería que el banco no las pagó antes de incluirlas otra vez."
    )
  })
})

describe("tituloDispersion", () => {
  it("usa el día de Bogotá", () => {
    // 8:00 p. m. del 18 en Bogotá es ya 19 en UTC.
    expect(tituloDispersion("2026-10-19T01:00:00Z")).toBe(
      "Archivo del 18 oct 2026"
    )
  })
})
