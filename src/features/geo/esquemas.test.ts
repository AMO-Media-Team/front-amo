import { describe, expect, it } from "vitest"

import { leerParametrosGeo } from "./esquemas"

const leer = (parametros: Record<string, string>) =>
  leerParametrosGeo(new URLSearchParams(parametros))

const PERIODO = { desde: "2026-09-01", hasta: "2026-09-30" }

describe("parámetros de GET /api/geo/metricas", () => {
  it("acepta una consulta de mapa válida", () => {
    const resultado = leer({ nivel: "nacional", metrica: "medios", ...PERIODO })
    expect(resultado).toEqual({
      ok: true,
      datos: {
        vista: "mapa",
        consulta: {
          nivel: "nacional",
          metrica: "medios",
          ...PERIODO,
          departamento: null,
        },
      },
    })
  })

  it("el detalle normaliza la zona y agrega las métricas del nivel", () => {
    const resultado = leer({
      vista: "detalle",
      nivel: "internacional",
      metrica: "audiencia",
      zona: "us",
      ...PERIODO,
    })
    expect(resultado.ok).toBe(true)
    if (resultado.ok && resultado.datos.vista === "detalle") {
      expect(resultado.datos.consulta.zona).toBe("US")
      expect(resultado.datos.consulta.metricasKpi).toContain("audiencia")
    }
  })

  it("el modo calor solo existe para métricas con puntos reales", () => {
    expect(
      leer({
        vista: "puntos",
        nivel: "nacional",
        metrica: "accesos",
        ...PERIODO,
      })
    ).toMatchObject({
      ok: true,
      datos: { vista: "puntos", consulta: { metrica: "accesos" } },
    })
    expect(
      leer({ vista: "puntos", nivel: "nacional", metrica: "gmv", ...PERIODO })
        .ok
    ).toBe(false)
  })

  it("el detalle no incluye los medios destacados por omisión (lo decide la ruta)", () => {
    const resultado = leer({
      vista: "detalle",
      nivel: "nacional",
      metrica: "gmv",
      zona: "05",
      ...PERIODO,
    })
    expect(
      resultado.ok &&
        resultado.datos.vista === "detalle" &&
        resultado.datos.consulta.conMedios
    ).toBe(false)
  })

  it.each([
    ["métrica fuera de la matriz", { nivel: "internacional", metrica: "gmv" }],
    ["nivel desconocido", { nivel: "galaxia", metrica: "medios" }],
    [
      "departamental sin departamento",
      { nivel: "departamental", metrica: "medios" },
    ],
    [
      "municipio de otro departamento",
      {
        nivel: "departamental",
        depto: "05",
        metrica: "medios",
        vista: "detalle",
        zona: "08001",
      },
    ],
  ])("rechaza %s", (_caso, parametros) => {
    expect(leer({ ...PERIODO, ...parametros }).ok).toBe(false)
  })

  it("los mensajes de validación llegan en español, también si falta un parámetro", () => {
    const mensajes = (parametros: Record<string, string>) => {
      const resultado = leer(parametros)
      return resultado.ok
        ? []
        : resultado.error.issues.map((issue) => issue.message)
    }
    const todos = [
      ...mensajes({ nivel: "galaxia", metrica: "medios", ...PERIODO }),
      ...mensajes({ nivel: "nacional", metrica: "ventas", ...PERIODO }),
      ...mensajes({
        vista: "tabla",
        nivel: "nacional",
        metrica: "medios",
        ...PERIODO,
      }),
      ...mensajes({ nivel: "nacional", metrica: "medios" }),
      ...mensajes({}),
    ]
    expect(todos.length).toBeGreaterThanOrEqual(8)
    for (const mensaje of todos) {
      expect(mensaje).not.toMatch(/invalid|expected|received|required/i)
    }
    expect(mensajes({ nivel: "nacional", metrica: "medios" })).toContain(
      "Usa una fecha válida con formato AAAA-MM-DD."
    )
  })

  it("rechaza fechas inválidas, invertidas o rangos de más de dos años", () => {
    const base = { nivel: "nacional", metrica: "medios" }
    expect(leer({ ...base, desde: "2026-13-01", hasta: "2026-09-30" }).ok).toBe(
      false
    )
    expect(leer({ ...base, desde: "2026-09-30", hasta: "2026-09-01" }).ok).toBe(
      false
    )
    expect(leer({ ...base, desde: "2020-01-01", hasta: "2026-09-30" }).ok).toBe(
      false
    )
  })
})
