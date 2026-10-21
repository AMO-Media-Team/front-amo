import { describe, expect, it } from "vitest"

import { AHORA, entradaVacia, filaKpi, filaMezcla, PERIODO } from "./fixtures"
import { compararInsights, generarInsights, MAXIMO_INICIO } from "./motor"
import { construirHref } from "./rutas"
import { capitalizar, enumerarLimitado, nombrePais, plural } from "./textos"
import type { Insight } from "./tipos"

function insight(
  id: string,
  severidad: Insight["severidad"],
  magnitud: number
): Insight {
  return { id, regla: 1, severidad, titulo: id, detalle: "", magnitud }
}

describe("generarInsights", () => {
  it("sin datos no produce hallazgos", () => {
    expect(generarInsights(entradaVacia())).toEqual([])
  })

  it("combina todas las reglas y ordena por severidad y magnitud", () => {
    const insights = generarInsights(
      entradaVacia({
        kpis: [
          filaKpi("gmv_verificado", 150, 100),
          filaKpi("gmv_comprometido", 70, 100),
          filaKpi("tasa_cumplimiento", 0.8, 0.9, { unidad: "%" }),
        ],
        vencidas: { total: 4, porDepartamento: [], porMedio: [] },
        mediosEnRiesgo: {
          cantidad: 2,
          gmvEnJuego: 1_000_000,
          gmvVerificado90d: 100_000_000,
          top: [],
        },
        mezclaPlataformas: [
          filaMezcla("INSTAGRAM", "reel", "Reels", 8_000),
          filaMezcla("FACEBOOK", "post", "Publicaciones", 20_000),
        ],
        metricasAtipicas: {
          total: 2,
          desviacion: 2,
          multiplo: 0,
          masAntiguaAt: new Date(AHORA.getTime() - 72 * 3_600_000),
        },
        accesosSospechosos: [
          {
            usuarioId: "u",
            paisIso2: "RU",
            esInterno: false,
            motivo: "PAIS_INUSUAL",
          },
        ],
      })
    )
    expect(insights.map((i) => `${i.severidad}:${i.id}`)).toEqual([
      "critico:metricas-atipicas",
      "atencion:variacion-gmv_comprometido",
      // Misma magnitud (0,1): desempata el id.
      "atencion:accesos-inusuales",
      "atencion:cumplimiento",
      "positivo:variacion-gmv_verificado",
      "positivo:cpm-instagram-reel",
      "info:medios-riesgo",
    ])
    expect(new Set(insights.map((i) => i.regla))).toEqual(
      new Set([1, 2, 3, 4, 5, 6])
    )
  })

  it("todo texto está en español, sin jerga ni valores sin formatear", () => {
    const insights = generarInsights(
      entradaVacia({
        kpis: [filaKpi("gmv_verificado", 1_234_567_890, 1_000_000_000)],
      })
    )
    for (const { titulo, detalle } of insights) {
      expect(`${titulo} ${detalle}`).not.toMatch(
        /MoM|NaN|undefined|null|1234567890/
      )
    }
  })

  it("en Inicio se muestran como máximo 4", () => {
    expect(MAXIMO_INICIO).toBe(4)
  })
})

describe("compararInsights", () => {
  it("crítico > atención > positivo > info; luego magnitud; luego id", () => {
    const lista = [
      insight("d", "info", 0.9),
      insight("b", "positivo", 0.1),
      insight("a", "critico", 0.2),
      insight("c", "atencion", 0.3),
      insight("e", "atencion", 0.8),
      insight("f", "atencion", 0.8),
    ]
    expect([...lista].sort(compararInsights).map((i) => i.id)).toEqual([
      "a",
      "e",
      "f",
      "c",
      "b",
      "d",
    ])
  })
})

describe("construirHref", () => {
  it("omite parámetros vacíos y conserva el periodo", () => {
    expect(
      construirHref(
        "/analitica/mapa",
        { metrica: "gmv", departamento: undefined, plataforma: "" },
        PERIODO
      )
    ).toBe("/analitica/mapa?metrica=gmv&desde=2026-09-01&hasta=2026-09-30")
    expect(construirHref("/operacion/medios", {})).toBe("/operacion/medios")
  })

  it("codifica los valores", () => {
    expect(construirHref("/x", { q: "San Andrés & Providencia" })).toBe(
      "/x?q=San+Andr%C3%A9s+%26+Providencia"
    )
  })
})

describe("textos", () => {
  it("enumera con límite y concuerda en número", () => {
    expect(enumerarLimitado(["A", "B", "C"])).toBe("A, B y C")
    expect(enumerarLimitado(["A", "B", "C", "D", "E"])).toBe("A, B, C y 2 más")
    expect(plural(1, "medio", "medios")).toBe("1 medio")
    expect(plural(1500, "medio", "medios")).toBe("1.500 medios")
  })

  it("nombra países en español y tolera códigos inválidos", () => {
    expect(nombrePais("us")).toBe("Estados Unidos")
    expect(nombrePais("RU", "  Federación Rusa ")).toBe("Federación Rusa")
    expect(nombrePais("??")).toBe("??")
  })

  it("capitaliza la primera letra", () => {
    expect(capitalizar("ámbito")).toBe("Ámbito")
    expect(capitalizar("")).toBe("")
  })
})
