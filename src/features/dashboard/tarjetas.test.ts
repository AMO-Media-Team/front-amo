import { describe, expect, it } from "vitest"

import { filaKpi } from "@/features/dashboard/insights/fixtures"

import { hayActividad, indicePorKpi } from "./kpi"
import {
  KPI_ACTIVIDAD_ADMIN,
  KPI_ACTIVIDAD_ANUNCIANTE,
  MINIMO_ANUNCIANTES_TICKET,
  tarjetasAdmin,
  tarjetasAnunciante,
} from "./tarjetas"

/** Los separadores de Intl (U+00A0, U+202F) como espacios, para comparar. */
const plano = (texto: string | undefined) => texto?.replace(/[  ]/g, " ")

const indice = (valores: Record<string, number | null>) =>
  indicePorKpi(
    Object.entries(valores).map(([kpi, valor]) => filaKpi(kpi, valor, null))
  )

describe("tarjetasAdmin", () => {
  it("las 8 tarjetas de docs/kpis.md §1, en orden", () => {
    expect(tarjetasAdmin(indice({})).map((t) => t.kpi)).toEqual([
      "gmv_verificado",
      "comision",
      "negocios_cerrados",
      "tasa_llenado",
      "tasa_cumplimiento",
      "alcance_total",
      "medios_activos",
      "anunciantes_activos",
    ])
  })

  it("acompaña cada KPI con su dato de contexto", () => {
    const tarjetas = tarjetasAdmin(
      indice({
        gmv_comprometido: 25_000_000,
        take_rate: 0.2,
        ofertas_publicadas: 1234,
        tiempo_medio_llenado_h: 5.25,
        tasa_aceptacion: 0.8,
        alcance_total: 1_000_000,
        negocios_cerrados: 40,
        medios_nuevos: 3,
        medios_en_riesgo: 0,
        anunciantes_activos: 12,
        ticket_promedio: 1_500_000,
      })
    )
    const secundario = Object.fromEntries(
      tarjetas.map((t) => [t.kpi, plano(t.secundario?.valor)])
    )
    expect(secundario).toEqual({
      gmv_verificado: "$25 M",
      comision: "20,0%",
      negocios_cerrados: "1.234",
      tasa_llenado: "5,3 h",
      tasa_cumplimiento: "80,0%",
      alcance_total: "25 mil",
      medios_activos: "3 · 0",
      anunciantes_activos: "$1,5 M",
    })
    expect(tarjetas.every((t) => t.secundario?.tono !== "aviso")).toBe(true)
  })

  it("resalta los medios en riesgo", () => {
    const medios = tarjetasAdmin(indice({ medios_en_riesgo: 4 })).find(
      (t) => t.kpi === "medios_activos"
    )
    expect(medios?.secundario).toMatchObject({ valor: "0 · 4", tono: "aviso" })
  })

  it("avisa que el ticket promedio tiene muestra pequeña con menos de 5 anunciantes", () => {
    const ticket = (anunciantes: number) =>
      tarjetasAdmin(
        indice({ anunciantes_activos: anunciantes, ticket_promedio: 900_000 })
      ).find((t) => t.kpi === "anunciantes_activos")?.secundario
    // Etiqueta corta (cabe a 390 px) y el aviso completo para `title` y lectores.
    expect(ticket(MINIMO_ANUNCIANTES_TICKET - 1)).toEqual({
      etiqueta: "Ticket (n < 5)",
      titulo: "Ticket promedio con pocos datos: menos de 5 anunciantes",
      valor: expect.stringContaining("900"),
      tono: "aviso",
    })
    expect(ticket(MINIMO_ANUNCIANTES_TICKET)).toMatchObject({
      etiqueta: "Ticket promedio",
      tono: "neutro",
    })
    expect(ticket(0)?.tono).toBe("neutro")
  })

  it("sin datos muestra un guion, no ceros inventados", () => {
    const [gmv, , , llenado, , alcance] = tarjetasAdmin(indice({}))
    expect(gmv.secundario?.valor).toBe("—")
    expect(llenado.secundario?.valor).toBe("—")
    expect(alcance.secundario?.valor).toBe("—")
  })
})

describe("tarjetasAnunciante", () => {
  it("las 8 tarjetas de docs/kpis.md §3.1, con títulos propios", () => {
    const tarjetas = tarjetasAnunciante(indice({}))
    expect(tarjetas.map((t) => t.kpi)).toEqual([
      "inversion_verificada",
      "alcance_total",
      "impresiones",
      "interacciones",
      "cpm_efectivo",
      "costo_por_interaccion",
      "engagement",
      "campanas_activas",
    ])
    expect(tarjetas[0].titulo).toBe("Inversión")
    expect(tarjetas[1].titulo).toBe("Alcance")
  })

  it("convierte el costo por persona a costo por mil personas", () => {
    const cpm = tarjetasAnunciante(indice({ costo_por_alcance: 12 })).find(
      (t) => t.kpi === "cpm_efectivo"
    )
    // En pesos exactos, como el CPM: "$12 k" no se compara con "$ 8.300".
    expect(plano(cpm?.secundario?.valor)).toBe("$ 12.000")
    expect(cpm?.secundario).toMatchObject({
      etiqueta: "Mil personas",
      titulo: "Costo por mil personas alcanzadas",
    })
  })

  it("une ofertas publicadas y tasa de llenado en la tarjeta de campañas", () => {
    const campanas = tarjetasAnunciante(
      indice({ ofertas_publicadas: 7, tasa_llenado: 0.5 })
    ).find((t) => t.kpi === "campanas_activas")
    expect(plano(campanas?.secundario?.valor)).toBe("7 · 50%")
    // Etiqueta corta (cabe a 390 px) con su versión completa para `title`.
    expect(campanas?.secundario).toMatchObject({
      etiqueta: "Ofertas · cupos",
      titulo: "Ofertas publicadas · cupos tomados",
    })
  })
})

describe("KPI de actividad", () => {
  const filas = (valores: Record<string, number | null>) =>
    Object.entries(valores).map(([kpi, valor]) =>
      filaKpi(kpi, valor, null, { n: 0 })
    )

  it("el periodo está vacío si no hubo negocios, ofertas ni medios activos", () => {
    const vacio = filas({
      gmv_verificado: 0,
      medios_activos: 0,
      take_rate: null,
    })
    expect(hayActividad(vacio, KPI_ACTIVIDAD_ADMIN)).toBe(false)
    // Los medios en riesgo son una foto: no prueban movimiento en el periodo.
    expect(
      hayActividad(filas({ medios_en_riesgo: 4 }), KPI_ACTIVIDAD_ADMIN)
    ).toBe(false)
    expect(
      hayActividad(filas({ ofertas_publicadas: 2 }), KPI_ACTIVIDAD_ADMIN)
    ).toBe(true)
  })

  it("al anunciante le basta una campaña activa para no ver el aviso", () => {
    expect(
      hayActividad(filas({ inversion_verificada: 0 }), KPI_ACTIVIDAD_ANUNCIANTE)
    ).toBe(false)
    expect(
      hayActividad(filas({ campanas_activas: 1 }), KPI_ACTIVIDAD_ANUNCIANTE)
    ).toBe(true)
  })
})
