import { describe, expect, it } from "vitest"

import {
  listarDepartamentos,
  municipiosDeDepartamento,
} from "@/lib/geo/catalogo"

import { metricasDelNivel } from "./metricas"
import { crearProveedorSimulado } from "./proveedor-simulado"
import type { ConsultaMapaGeo } from "./tipos"

const proveedor = crearProveedorSimulado()

const BASE: ConsultaMapaGeo = {
  nivel: "nacional",
  metrica: "medios",
  desde: "2026-09-01",
  hasta: "2026-09-30",
  departamento: null,
}

const suma = (valores: readonly (number | null)[]) =>
  valores.reduce<number>((total, valor) => total + (valor ?? 0), 0)

describe("proveedor simulado (AMO_GEO_MOCK)", () => {
  it("es determinista: mismas entradas, mismas cifras", async () => {
    const a = await proveedor.mapa(BASE)
    const b = await proveedor.mapa(BASE)
    expect(a).toEqual(b)
    expect(a.origen).toBe("simulado")
  })

  it("cubre los 33 departamentos y cada municipio suma lo de su departamento", async () => {
    const nacional = await proveedor.mapa(BASE)
    expect(nacional.filas).toHaveLength(listarDepartamentos().length)
    const antioquia = nacional.filas.find((f) => f.codigo === "05")

    const municipal = await proveedor.mapa({
      ...BASE,
      nivel: "departamental",
      departamento: "05",
    })
    expect(suma(municipal.filas.map((f) => f.valor))).toBe(antioquia?.valor)
    const codigos = new Set(municipiosDeDepartamento("05").map((m) => m.codigo))
    expect(municipal.filas.every((f) => codigos.has(f.codigo))).toBe(true)
  })

  it("Colombia en el mapa mundial es la suma de sus departamentos", async () => {
    const consulta = { ...BASE, metrica: "accesos" as const }
    const nacional = await proveedor.mapa(consulta)
    const mundo = await proveedor.mapa({ ...consulta, nivel: "internacional" })
    const colombia = mundo.filas.find((f) => f.codigo === "CO")
    expect(colombia?.valor).toBe(suma(nacional.filas.map((f) => f.valor)))
  })

  it("marca los países sin polígono para dibujarlos como círculos", async () => {
    const mundo = await proveedor.mapa({
      ...BASE,
      nivel: "internacional",
      metrica: "audiencia",
    })
    const circulos = mundo.sinPoligono.map((c) => c.codigo)
    expect(circulos).toContain("AW")
    expect(circulos).not.toContain("US")
  })

  it("solo trae puntos para el mapa de calor en métricas con coordenadas reales", async () => {
    const calor = await proveedor.puntos(BASE)
    expect(calor.puntos.length).toBeGreaterThan(0)
    expect(calor.total).toBe(calor.muestra)
    expect(
      (await proveedor.puntos({ ...BASE, metrica: "gmv" })).puntos
    ).toEqual([])
  })

  it("las tasas con muestra insuficiente vuelven sin valor pero con n", async () => {
    const { filas } = await proveedor.mapa({ ...BASE, metrica: "cumplimiento" })
    const insuficientes = filas.filter((f) => f.valor === null)
    expect(insuficientes.length).toBeGreaterThan(0)
    expect(insuficientes.every((f) => (f.n ?? 0) < 20)).toBe(true)
  })

  it("el detalle trae KPI por métrica, serie semanal, subzonas y medios", async () => {
    const detalle = await proveedor.detalle({
      ...BASE,
      zona: "05",
      metricasKpi: metricasDelNivel("nacional"),
      conMedios: true,
    })
    expect(detalle.kpis.map((k) => k.metrica)).toEqual(
      metricasDelNivel("nacional")
    )
    expect(detalle.serie?.granularidad).toBe("semana")
    expect(detalle.serie?.puntos).toHaveLength(5)
    expect(detalle.sinSerie).toBeNull()
    expect(detalle.top?.filas.length).toBeLessThanOrEqual(5)
    expect(detalle.medios?.filas).toHaveLength(5)
    expect(detalle.medios?.metrica).toBe("gmv")
  })

  it("los KPI traen el comparativo con el periodo anterior, como `detalle_zona_geo`", async () => {
    const { kpis } = await proveedor.detalle({
      ...BASE,
      metrica: "gmv",
      zona: "05",
      metricasKpi: ["gmv", "medios"],
      conMedios: false,
    })
    for (const kpi of kpis) {
      expect(kpi.anterior).toBeGreaterThan(0)
      expect(kpi.variacion).toBeCloseTo(
        ((kpi.valor ?? 0) - (kpi.anterior ?? 0)) / (kpi.anterior ?? 1)
      )
    }
  })

  it("la audiencia es una foto actual: sin evolución", async () => {
    const detalle = await proveedor.detalle({
      ...BASE,
      nivel: "internacional",
      metrica: "audiencia",
      zona: "US",
      metricasKpi: ["audiencia"],
      conMedios: false,
    })
    expect(detalle.serie).toBeNull()
    expect(detalle.sinSerie).toBe("foto-actual")
    expect(detalle.medios).toBeNull()
  })
})
