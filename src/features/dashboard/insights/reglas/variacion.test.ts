import { describe, expect, it } from "vitest"

import { entradaVacia, filaKpi } from "../fixtures"
import type { FilaDesglose } from "../tipos"
import { causaPrincipal, reglaVariacion } from "./variacion"

const plano = (texto: string) => texto.replace(/[\u00a0\u202f]/g, " ")

const grupo = (
  clave: string,
  nombre: string,
  valor: number,
  valorAnterior: number
): FilaDesglose => ({
  clave,
  nombre,
  valor,
  valorAnterior,
})

describe("reglaVariacion — disparo", () => {
  it("dispara justo en el umbral (15 %) y marca como positivo una subida", () => {
    const [insight] = reglaVariacion(
      entradaVacia({
        kpis: [filaKpi("gmv_verificado", 115_000_000, 100_000_000)],
      })
    )
    expect(insight).toMatchObject({
      id: "variacion-gmv_verificado",
      regla: 1,
      severidad: "positivo",
      metrica: "gmv_verificado",
    })
    expect(insight.titulo).toBe("El GMV verificado subió 15,0%")
    expect(plano(insight.detalle)).toBe(
      "Pasó de $100 M en el periodo anterior a $115 M."
    )
    expect(insight.valor).toBeCloseTo(0.15)
  })

  it("no dispara por debajo del umbral", () => {
    const entrada = entradaVacia({
      kpis: [filaKpi("gmv_verificado", 114_900_000, 100_000_000)],
    })
    expect(reglaVariacion(entrada)).toEqual([])
  })

  it("una bajada es «atención» y respeta el umbral configurado", () => {
    const entrada = entradaVacia({
      kpis: [filaKpi("gmv_comprometido", 88, 100)],
      config: { ...entradaVacia().config, umbralVariacion: 0.1 },
    })
    const [insight] = reglaVariacion(entrada)
    expect(insight.severidad).toBe("atencion")
    expect(insight.titulo).toBe("El GMV comprometido bajó 12,0%")
  })

  it("concuerda en plural y usa la variación de la RPC si viene", () => {
    const [insight] = reglaVariacion(
      entradaVacia({
        kpis: [
          filaKpi("negocios_cerrados", 60, 40, {
            unidad: "conteo",
            variacion: 0.5,
          }),
        ],
      })
    )
    expect(insight.titulo).toBe("Los negocios cerrados subieron 50,0%")
    expect(insight.detalle).toBe("Pasó de 40 en el periodo anterior a 60.")
  })

  it("evalúa los cuatro KPI de volumen e ignora los demás", () => {
    const kpis = [
      filaKpi("gmv_verificado", 200, 100),
      filaKpi("gmv_comprometido", 200, 100),
      filaKpi("negocios_cerrados", 200, 100, { unidad: "conteo" }),
      filaKpi("alcance_total", 2_000_000, 1_000_000, { unidad: "personas" }),
      filaKpi("medios_activos", 200, 100, { unidad: "conteo" }),
    ]
    const insights = reglaVariacion(entradaVacia({ kpis }))
    expect(insights.map((i) => i.metrica)).toEqual([
      "gmv_verificado",
      "gmv_comprometido",
      "negocios_cerrados",
      "alcance_total",
    ])
    expect(plano(insights[3].detalle)).toContain(
      "de 1 M en el periodo anterior a 2 M"
    )
  })
})

describe("reglaVariacion — muestra y datos faltantes", () => {
  it("exige n mínimo en el periodo actual", () => {
    const entrada = entradaVacia({
      kpis: [filaKpi("gmv_verificado", 200, 100, { n: 19 })],
    })
    expect(reglaVariacion(entrada)).toEqual([])
    const justo = entradaVacia({
      kpis: [filaKpi("gmv_verificado", 200, 100, { n: 20 })],
    })
    expect(reglaVariacion(justo)).toHaveLength(1)
  })

  it("exige n mínimo en el anterior cuando se conoce", () => {
    const conAnterior = entradaVacia({
      kpis: [filaKpi("gmv_verificado", 200, 100, { n: 30, n_anterior: 12 })],
    })
    expect(reglaVariacion(conAnterior)).toEqual([])
    // En los conteos el valor anterior es su propia muestra.
    const conteo = entradaVacia({
      kpis: [filaKpi("negocios_cerrados", 40, 19, { unidad: "conteo", n: 40 })],
    })
    expect(reglaVariacion(conteo)).toEqual([])
  })

  it("sin valor, sin anterior o con anterior cero no compara", () => {
    for (const fila of [
      filaKpi("gmv_verificado", null, 100),
      filaKpi("gmv_verificado", 100, null),
      filaKpi("gmv_verificado", 100, 0),
    ]) {
      expect(reglaVariacion(entradaVacia({ kpis: [fila] }))).toEqual([])
    }
    expect(reglaVariacion(entradaVacia())).toEqual([])
  })
})

describe("reglaVariacion — causa principal", () => {
  const kpis = [filaKpi("gmv_verificado", 150, 100)]

  it("nombra la zona que explica el cambio y enlaza al mapa filtrado", () => {
    const [insight] = reglaVariacion(
      entradaVacia({
        kpis,
        desgloses: {
          gmv_verificado: {
            departamento: [
              grupo("05", "Antioquia", 60, 30),
              grupo("11", "Bogotá", 50, 40),
              grupo("76", "Valle", 40, 30),
            ],
          },
        },
      })
    )
    expect(plano(insight.detalle)).toBe(
      "Pasó de $ 100 en el periodo anterior a $ 150. Antioquia explica el 60% del cambio."
    )
    expect(insight.accion).toEqual({
      etiqueta: "Explorar Antioquia en el mapa",
      href: "/analitica/mapa?metrica=gmv&nivel=departamental&depto=05&desde=2026-09-01&hasta=2026-09-30",
    })
  })

  it("con zona y plataforma las nombra por separado", () => {
    const [insight] = reglaVariacion(
      entradaVacia({
        kpis,
        desgloses: {
          gmv_verificado: {
            departamento: [
              grupo("05", "Antioquia", 90, 30),
              grupo("11", "Bogotá", 30, 40),
            ],
            plataforma: [
              grupo("INSTAGRAM", "Instagram", 90, 50),
              grupo("FACEBOOK", "Facebook", 60, 50),
            ],
          },
        },
      })
    )
    expect(plano(insight.detalle)).toContain(
      "Antioquia explica prácticamente todo el cambio; por plataforma, Instagram aporta el 80%."
    )
  })

  it("solo con plataforma enlaza al mapa nacional (el mapa no filtra plataformas)", () => {
    const [insight] = reglaVariacion(
      entradaVacia({
        kpis,
        desgloses: {
          gmv_verificado: { plataforma: [grupo("TIKTOK", "TikTok", 80, 40)] },
        },
      })
    )
    expect(insight.detalle).toContain("TikTok explica el 80% del cambio.")
    expect(insight.accion?.href).toBe(
      "/analitica/mapa?metrica=gmv&desde=2026-09-01&hasta=2026-09-30"
    )
    expect(insight.accion?.etiqueta).toBe("Explorar en el mapa")
  })

  it("si ningún grupo llega al 30 % el cambio es generalizado", () => {
    const departamentos = ["A", "B", "C", "D", "E"].map((nombre) =>
      grupo(nombre, nombre, 30, 20)
    )
    const [insight] = reglaVariacion(
      entradaVacia({
        kpis,
        desgloses: { gmv_verificado: { departamento: departamentos } },
      })
    )
    expect(plano(insight.detalle)).toContain(
      "El cambio es generalizado: ninguna zona ni plataforma explica por sí sola el 30%."
    )
  })
})

describe("reglaVariacion — enlace al mapa", () => {
  it("solo abre un departamento si la clave es un código DANE de 2 dígitos", () => {
    const [insight] = reglaVariacion(
      entradaVacia({
        kpis: [filaKpi("alcance_total", 200, 100, { unidad: "personas" })],
        desgloses: {
          alcance_total: {
            departamento: [grupo("05001", "Medellín", 190, 100)],
          },
        },
      })
    )
    expect(insight.detalle).toContain("Medellín explica el 90% del cambio.")
    expect(insight.accion).toEqual({
      etiqueta: "Explorar en el mapa",
      href: "/analitica/mapa?metrica=alcance&desde=2026-09-01&hasta=2026-09-30",
    })
  })
})

describe("causaPrincipal", () => {
  it("ignora grupos que se movieron en sentido contrario", () => {
    const causa = causaPrincipal(
      [grupo("a", "A", 0, 100), grupo("b", "B", 130, 10)],
      20
    )
    expect(causa?.fila.nombre).toBe("B")
    expect(causa?.participacion).toBe(1)
  })

  it("en empate elige por nombre para un texto estable", () => {
    const causa = causaPrincipal(
      [grupo("v", "Valle", 50, 0), grupo("a", "Atlántico", 50, 0)],
      100
    )
    expect(causa).toEqual({
      fila: grupo("a", "Atlántico", 50, 0),
      participacion: 0.5,
    })
  })

  it("justo en el 30 % cuenta como causa; por debajo no", () => {
    expect(causaPrincipal([grupo("a", "A", 30, 0)], 100)?.participacion).toBe(
      0.3
    )
    expect(causaPrincipal([grupo("a", "A", 29, 0)], 100)).toBeNull()
  })

  it("sin filas o sin cambio total no hay causa", () => {
    expect(causaPrincipal(undefined, 10)).toBeNull()
    expect(causaPrincipal([], 10)).toBeNull()
    expect(causaPrincipal([grupo("a", "A", 5, 1)], 0)).toBeNull()
  })
})
