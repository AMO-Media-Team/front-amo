import type { Route } from "next"
import { describe, expect, it } from "vitest"

import { conversionesEmbudo } from "@/components/charts/datos"
import { AHORA, filaKpi, PERIODO } from "@/features/dashboard/insights/fixtures"
import {
  CONFIG_INSIGHTS_POR_DEFECTO,
  type Insight,
} from "@/features/dashboard/insights/tipos"

import {
  baseSalud,
  celdasCalor,
  combinarZonas,
  conAccionesAccesibles,
  cpmPorPlataforma,
  desgloseDeZonas,
  embudoPanel,
  embudoVacio,
  entradaInsightsAdmin,
  etapasEmbudo,
  type FilaMezclaPanel,
  type FilaZona,
  leyendaSiglas,
  mediosEnRiesgoEntrada,
  picoActividad,
  rankingFormatos,
  segmentosPlataforma,
  segmentosSalud,
  tendenciaGmv,
  totalCalor,
  valoresMapa,
  vencidasDelPeriodo,
} from "./datos"

const mezcla = (
  plataforma: FilaMezclaPanel["plataforma"],
  formatoClave: string,
  gmv: number,
  cpmEfectivo: number | null = null,
  extra: Partial<FilaMezclaPanel> = {}
): FilaMezclaPanel => ({
  plataforma,
  formatoClave,
  formatoNombre: formatoClave,
  asignaciones: 1,
  gmv,
  alcance: gmv / 10,
  participacion: null,
  cpmEfectivo,
  ...extra,
})

const zona = (codigo: string, nombre: string, valor: number): FilaZona => ({
  codigo,
  nombre,
  valor,
  participacion: null,
})

describe("tendenciaGmv", () => {
  it("separa las series y suma los totales del periodo", () => {
    const datos = tendenciaGmv(
      [
        {
          periodo: "2026-09-01",
          gmvComprometido: 9,
          gmvVerificado: 100,
          comision: 20,
          negocios: 1,
          aceptadas: 1,
        },
        {
          periodo: "2026-09-02",
          gmvComprometido: 9,
          gmvVerificado: 50,
          comision: 10,
          negocios: 1,
          aceptadas: 1,
        },
      ],
      "dia"
    )
    expect(datos).toEqual({
      granularidad: "dia",
      etiquetas: ["1 sept", "2 sept"],
      gmvVerificado: [100, 50],
      comision: [20, 10],
      totalGmv: 150,
      totalComision: 30,
    })
  })
})

describe("embudo", () => {
  it("ordena las etapas, les pone nombre y no admite negativos", () => {
    const etapas = etapasEmbudo([
      { etapa: "publicadas", orden: 4, cantidad: 3 },
      { etapa: "aceptadas", orden: 2, cantidad: -1 },
      { etapa: "etapa_nueva", orden: 9, cantidad: 1 },
    ])
    expect(etapas).toEqual([
      { id: "aceptadas", nombre: "Aceptadas", cantidad: 0 },
      { id: "publicadas", nombre: "Publicadas", cantidad: 3 },
      { id: "etapa_nueva", nombre: "etapa_nueva", cantidad: 1 },
    ])
  })

  it("separa las ofertas vistas: el 100 % del embudo son las aceptadas", () => {
    const { vistas, ejecucion } = embudoPanel(
      etapasEmbudo([
        { etapa: "vistas", orden: 1, cantidad: 3120 },
        { etapa: "aceptadas", orden: 2, cantidad: 520 },
        { etapa: "pagadas", orden: 8, cantidad: 260 },
      ])
    )
    expect(vistas).toBe(3120)
    expect(ejecucion.map((etapa) => etapa.id)).toEqual(["aceptadas", "pagadas"])
    // Con las vistas como base, "pagadas" sería el 8,3 % de otra cohorte.
    expect(conversionesEmbudo(ejecucion).at(-1)?.delInicio).toBe(0.5)
    expect(embudoVacio(ejecucion)).toBe(false)
  })

  it("sin la etapa de vistas no inventa un cero", () => {
    expect(embudoPanel([])).toEqual({ vistas: null, ejecucion: [] })
  })

  it("está vacío si solo hay ofertas vistas", () => {
    expect(
      embudoVacio([
        { id: "vistas", nombre: "Ofertas vistas", cantidad: 40 },
        { id: "aceptadas", nombre: "Aceptadas", cantidad: 0 },
      ])
    ).toBe(true)
    expect(
      embudoVacio([{ id: "aceptadas", nombre: "Aceptadas", cantidad: 1 }])
    ).toBe(false)
  })
})

describe("mezcla por plataforma y formato", () => {
  const filas = [
    mezcla("TIKTOK", "video", 300),
    mezcla("INSTAGRAM", "reel", 200),
    mezcla("INSTAGRAM", "historia", 100),
    mezcla("FACEBOOK", "post", 0),
  ]

  it("segmentos en orden fijo y sin plataformas sin GMV", () => {
    expect(segmentosPlataforma(filas)).toEqual([
      { id: "INSTAGRAM", nombre: "Instagram", valor: 300 },
      { id: "TIKTOK", nombre: "TikTok", valor: 300 },
    ])
  })

  it("cada formato con la sigla de su plataforma (el eje recorta a 22 caracteres)", () => {
    expect(rankingFormatos(filas).map((f) => f.nombre)).toEqual([
      "video · TikTok",
      "reel · IG",
      "historia · IG",
    ])
  })

  it("explica solo las siglas de las redes que aparecen en el ranking", () => {
    expect(leyendaSiglas(filas)).toBe("IG: Instagram")
    expect(
      leyendaSiglas([
        ...filas,
        mezcla("FACEBOOK", "post", 5),
        mezcla("FACEBOOK", "reel", 0),
      ])
    ).toBe("FB: Facebook · IG: Instagram")
    expect(leyendaSiglas([mezcla("TIKTOK", "video", 10)])).toBe("")
  })

  it("CPM por plataforma como cociente de sumas, no promedio de CPM", () => {
    const cpm = cpmPorPlataforma([
      // 1.000 impresiones a $10.000 de CPM y 4.000 a $5.000.
      mezcla("INSTAGRAM", "reel", 10_000, 10_000),
      mezcla("INSTAGRAM", "historia", 20_000, 5_000),
      mezcla("FACEBOOK", "post", 5_000, null),
    ])
    expect(cpm.get("INSTAGRAM")).toBeCloseTo(6_000)
    expect(cpm.get("FACEBOOK")).toBeNull()
    expect(cpm.get("TIKTOK")).toBeNull()
  })
})

describe("zonas", () => {
  const actual = [zona("05", "Antioquia", 50), zona("11", "Bogotá", 80)]
  const anterior = [zona("05", "Antioquia", 100), zona("76", "Valle", 30)]

  it("ordena por valor y compara contra el mismo comparativo de las tarjetas", () => {
    expect(combinarZonas(actual, anterior)).toEqual([
      { ...zona("11", "Bogotá", 80), valorAnterior: 0, variacion: null },
      { ...zona("05", "Antioquia", 50), valorAnterior: 100, variacion: -0.5 },
    ])
  })

  it("el mapa recibe solo las zonas con fila", () => {
    expect(valoresMapa(actual)).toEqual({ "05": 50, "11": 80 })
  })

  it("el desglose incluye las zonas que desaparecieron (explican caídas)", () => {
    expect(desgloseDeZonas(actual, anterior)).toContainEqual({
      clave: "76",
      nombre: "Valle",
      valor: 0,
      valorAnterior: 30,
    })
  })
})

describe("salud de medios", () => {
  it("los cinco segmentos en orden aunque la RPC omita alguno", () => {
    const segmentos = segmentosSalud([
      { segmento: "en_riesgo", cantidad: 2, porcentaje: 0.1, gmvEnJuego: 9 },
    ])
    expect(segmentos.map((s) => s.segmento)).toEqual([
      "activos",
      "nuevos",
      "en_riesgo",
      "inactivos",
      "suspendidos",
    ])
    expect(segmentos[0]).toEqual({
      segmento: "activos",
      cantidad: 0,
      porcentaje: null,
      gmvEnJuego: 0,
    })
  })

  it("deduce la base del porcentaje de cualquier fila con datos", () => {
    expect(
      baseSalud([
        { segmento: "activos", cantidad: 0, porcentaje: 0, gmvEnJuego: 0 },
        { segmento: "nuevos", cantidad: 5, porcentaje: 0.25, gmvEnJuego: 0 },
      ])
    ).toBe(20)
    expect(baseSalud([])).toBeNull()
  })

  it("arma la entrada de la regla 3 solo si llegó el segmento en riesgo", () => {
    const medio = {
      id: "m1",
      nombre: "Radio",
      departamento: "Huila",
      gmv90d: 7,
    }
    expect(mediosEnRiesgoEntrada([], [medio], 100)).toBeUndefined()
    expect(
      mediosEnRiesgoEntrada(
        [
          {
            segmento: "en_riesgo",
            cantidad: 3,
            porcentaje: 0.1,
            gmvEnJuego: 40,
          },
        ],
        [medio],
        100
      )
    ).toEqual({
      cantidad: 3,
      gmvEnJuego: 40,
      gmvVerificado90d: 100,
      top: [medio],
    })
  })
})

describe("mapa de calor", () => {
  const celdas = celdasCalor([
    { dia_semana: 1, hora: 9, cantidad: 4 },
    { dia_semana: 3, hora: 15, cantidad: 4 },
    { dia_semana: 2, hora: 0, cantidad: 1 },
  ])

  it("suma el total y elige el primer pico si empatan", () => {
    expect(totalCalor(celdas)).toBe(9)
    expect(picoActividad(celdas)).toEqual({
      diaSemana: 1,
      hora: 9,
      cantidad: 4,
    })
  })

  it("sin actividad no hay pico", () => {
    expect(
      picoActividad(celdasCalor([{ dia_semana: 1, hora: 1, cantidad: 0 }]))
    ).toBeNull()
  })
})

describe("vencidasDelPeriodo (regla 2)", () => {
  it("agrupa por departamento y por medio, sin filas en cero", () => {
    const vencidas = vencidasDelPeriodo([
      { medioId: "a", medio: "A", departamento: "Huila", vencidas: 2 },
      { medioId: "b", medio: "B", departamento: "Huila", vencidas: 1 },
      { medioId: "c", medio: "C", departamento: null, vencidas: 3 },
      { medioId: "d", medio: "D", departamento: "Cauca", vencidas: 0 },
    ])
    expect(vencidas.total).toBe(6)
    expect(vencidas.porDepartamento).toEqual([
      { clave: "Huila", nombre: "Huila", cantidad: 3 },
    ])
    expect(vencidas.porMedio.map((m) => m.clave)).toEqual(["a", "b", "c"])
  })
})

describe("conAccionesAccesibles", () => {
  const hallazgo = (id: string, href?: string): Insight => ({
    id,
    regla: 1,
    severidad: "info",
    titulo: id,
    detalle: "",
    magnitud: 0,
    accion: href ? { etiqueta: "Ver", href: href as Route } : undefined,
  })
  const insights = [
    hallazgo("mapa", "/analitica/mapa?metrica=gmv&depto=05"),
    hallazgo("reporte", "/reportes/cumplimiento-medios?desde=2026-09-01"),
    hallazgo("medios", "/operacion/medios?segmento=en_riesgo"),
    hallazgo("sin-accion"),
  ]

  it("conserva las acciones hacia secciones del menú, también subpáginas", () => {
    const resultado = conAccionesAccesibles(insights, [
      "/analitica/mapa",
      "/reportes",
      "/operacion/medios",
    ])
    expect(resultado).toEqual(insights)
  })

  it("quita la acción (no el hallazgo) si el destino no está en el menú", () => {
    const resultado = conAccionesAccesibles(insights, ["/inicio", "/reportes"])
    expect(resultado.map((i) => [i.id, i.accion?.href])).toEqual([
      ["mapa", undefined],
      ["reporte", "/reportes/cumplimiento-medios?desde=2026-09-01"],
      ["medios", undefined],
      ["sin-accion", undefined],
    ])
  })

  it("no confunde una sección con otra que empieza igual", () => {
    const [medios] = conAccionesAccesibles(
      [hallazgo("x", "/operacion/medios-archivados")],
      ["/operacion/medios"]
    )
    expect(medios.accion).toBeUndefined()
  })
})

describe("entradaInsightsAdmin", () => {
  const base = {
    periodo: PERIODO,
    ahora: AHORA,
    kpis: [filaKpi("gmv_verificado", 100, 50)],
    config: CONFIG_INSIGHTS_POR_DEFECTO,
  }

  it("sin datos opcionales, las reglas que los usan quedan sin desglose", () => {
    const entrada = entradaInsightsAdmin(base)
    expect(entrada.desgloses).toEqual({})
    expect(entrada.mezclaPlataformas).toBeUndefined()
    expect(entrada.kpis).toBe(base.kpis)
  })

  it("desglosa el GMV comprometido por zonas y lo verificado por plataforma", () => {
    const entrada = entradaInsightsAdmin({
      ...base,
      zonasGmv: { actual: [zona("05", "Antioquia", 10)], anterior: [] },
      mezcla: {
        actual: [mezcla("INSTAGRAM", "reel", 100, null, { asignaciones: 4 })],
        anterior: [mezcla("TIKTOK", "video", 40)],
      },
    })
    expect(entrada.desgloses?.gmv_comprometido?.departamento).toHaveLength(1)
    expect(entrada.desgloses?.gmv_verificado?.plataforma).toEqual([
      { clave: "INSTAGRAM", nombre: "Instagram", valor: 100, valorAnterior: 0 },
      { clave: "TIKTOK", nombre: "TikTok", valor: 0, valorAnterior: 40 },
    ])
    expect(entrada.desgloses?.negocios_cerrados?.plataforma?.[0].valor).toBe(4)
    expect(entrada.mezclaPlataformas).toHaveLength(1)
  })
})
