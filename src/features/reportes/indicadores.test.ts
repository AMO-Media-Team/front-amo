import { describe, expect, it } from "vitest"

import type { FilaKpi } from "@/components/kpi/tipos"

import {
  detalleIndicador,
  ETIQUETA_CUENTAS_DE_HOY,
  ETIQUETA_FOTO,
  indicador,
  indicadorDesdeFila,
  muestraInsuficiente,
  razon,
  sumar,
  textoAnteriorIndicador,
  textoCifraIndicador,
  textoValorIndicador,
  textoVariacionIndicador,
  variacionRelativa,
} from "./indicadores"

const plano = (texto: string) => texto.replace(/[  ]/g, " ")

const fila = (parcial: Partial<FilaKpi> = {}): FilaKpi => ({
  kpi: "gmv_verificado",
  valor: 120_000_000,
  valor_anterior: 100_000_000,
  variacion: 0.2,
  n: 300,
  n_anterior: 280,
  unidad: "COP",
  serie: [1, 2, 3],
  ...parcial,
})

describe("variacionRelativa, razon y sumar", () => {
  it("la variación no existe sin base de comparación", () => {
    expect(variacionRelativa(120, 100)).toBeCloseTo(0.2)
    expect(variacionRelativa(80, 100)).toBeCloseTo(-0.2)
    expect(variacionRelativa(50, 0)).toBeNull()
    expect(variacionRelativa(50, null)).toBeNull()
    expect(variacionRelativa(null, 100)).toBeNull()
    expect(variacionRelativa(Number.NaN, 100)).toBeNull()
  })

  it("las razones son cociente de sumas y no dividen entre cero", () => {
    expect(razon(30, 120)).toBe(0.25)
    expect(razon(30, 0)).toBeNull()
    expect(razon(0, 10)).toBe(0)
  })

  it("suma tratando los vacíos como cero", () => {
    expect(sumar([{ v: 1 }, { v: null }, { v: 2.5 }], (f) => f.v)).toBe(3.5)
    expect(sumar([], () => 1)).toBe(0)
  })
})

describe("indicadorDesdeFila", () => {
  it("toma nombre, sentido y definición del diccionario de KPI", () => {
    const ind = indicadorDesdeFila(fila(), 20, "dinero")
    expect(ind.titulo).toBe("GMV verificado")
    expect(ind.unidad).toBe("COP")
    expect(ind.sentido).toBe("mayor")
    expect(ind.definicion?.ancla).toBe("Fecha de verificación")
    expect(ind.icono).toBe("dinero")
    expect(ind.sinComparativo).toBeNull()
    // El GMV no es una tasa: no exige muestra mínima.
    expect(ind.nMinimo).toBeNull()
  })

  it("las tasas agregadas llevan el n mínimo", () => {
    const ind = indicadorDesdeFila(
      fila({ kpi: "tasa_cumplimiento", valor: null, n: 7, unidad: "%" }),
      20
    )
    expect(ind.nMinimo).toBe(20)
    expect(muestraInsuficiente(ind)).toBe(true)
  })
})

describe("indicador", () => {
  it("calcula la variación relativa frente al periodo anterior", () => {
    const ind = indicador({
      clave: "asignaciones",
      titulo: "Asignaciones",
      actual: 150,
      anterior: 120,
      unidad: "conteo",
      sentido: "mayor",
    })
    expect(ind.variacion).toBeCloseTo(0.25)
    expect(textoVariacionIndicador(ind)).toMatch(/^\+25,0\s?%$/)
  })

  it("las tasas se comparan en puntos porcentuales, no en porcentaje", () => {
    const ind = indicador({
      clave: "tasa",
      titulo: "Tasa de cumplimiento",
      actual: 0.9,
      anterior: 0.94,
      unidad: "%",
      sentido: "mayor",
    })
    expect(ind.variacion).toBeNull()
    expect(textoVariacionIndicador(ind)).toBe("−4,0 pp")
  })

  it("una tasa con muestra menor al mínimo no se informa", () => {
    const ind = indicador({
      clave: "tasa",
      titulo: "Tasa de cumplimiento",
      actual: 0.5,
      anterior: 0.9,
      unidad: "%",
      sentido: "mayor",
      n: 7,
      nMinimo: 20,
    })
    expect(ind.valor).toBeNull()
    expect(muestraInsuficiente(ind)).toBe(true)
    expect(textoValorIndicador(ind)).toBe("Muestra insuficiente (n = 7)")
    expect(textoValorIndicador(ind, { conMuestra: false })).toBe(
      "Muestra insuficiente"
    )
    expect(textoVariacionIndicador(ind)).toBe("—")
  })

  it("la ayuda se titula como la tarjeta, no con el nombre del diccionario", () => {
    const ind = indicador({
      clave: "alcance_total",
      titulo: "Alcance acumulado",
      actual: 10,
      unidad: "personas",
      sentido: "mayor",
      definicion: {
        nombre: "Alcance total",
        definicion: "Personas alcanzadas.",
        calculo: "Suma del último corte validado.",
        ancla: "Fecha de verificación",
        unidad: "personas",
        sentido: "mayor",
        exigeMuestra: false,
      },
    })
    expect(ind.definicion?.nombre).toBe("Alcance acumulado")
    expect(ind.definicion?.definicion).toBe("Personas alcanzadas.")
  })

  it("con la muestra justa sí se informa", () => {
    const ind = indicador({
      clave: "tasa",
      titulo: "Tasa",
      actual: 0.5,
      unidad: "%",
      sentido: "mayor",
      n: 20,
      nMinimo: 20,
    })
    expect(ind.valor).toBe(0.5)
    expect(muestraInsuficiente(ind)).toBe(false)
  })

  it("la razón de una entidad concreta se informa siempre, con su n", () => {
    const ind = indicador({
      clave: "cpm",
      titulo: "CPM efectivo",
      actual: 18_000,
      anterior: 20_000,
      unidad: "COP",
      sentido: "menor",
      n: 7,
      nMinimo: 20,
      entidad: true,
    })
    expect(ind.valor).toBe(18_000)
    expect(ind.variacion).toBeCloseTo(-0.1)
    expect(muestraInsuficiente(ind)).toBe(false)
    // Conserva el mínimo para anotar que la muestra es pequeña.
    expect(ind.nMinimo).toBe(20)
    expect(detalleIndicador(ind, true)).toContain("n = 7")
  })

  it("una entidad sin dato no habla de muestra: simplemente no hay dato", () => {
    const ind = indicador({
      clave: "cpm",
      titulo: "CPM efectivo",
      actual: null,
      unidad: "COP",
      sentido: "menor",
      n: 0,
      nMinimo: 20,
      entidad: true,
    })
    expect(ind.valor).toBeNull()
    expect(ind.nMinimo).toBeNull()
    expect(muestraInsuficiente(ind)).toBe(false)
    expect(textoValorIndicador(ind)).toBe("—")
    expect(detalleIndicador(ind, true)).toBeUndefined()
  })

  it("un valor nuevo (sin actividad antes) se rotula «Nuevo»", () => {
    const ind = indicador({
      clave: "ingresos",
      titulo: "Ingresos",
      actual: 12,
      anterior: 0,
      unidad: "conteo",
      sentido: "mayor",
    })
    expect(textoVariacionIndicador(ind)).toBe("Nuevo")
    expect(textoAnteriorIndicador(ind)).toBe("0")
  })

  it("un indicador sin comparativo no tiene anterior ni variación, aunque se le pase uno", () => {
    const ind = indicador({
      clave: "sin_mfa",
      titulo: "Sin verificación en dos pasos",
      actual: 4,
      anterior: 9,
      unidad: "conteo",
      sentido: "menor",
      sinComparativo: ETIQUETA_FOTO,
    })
    expect(ind.sinComparativo).toBe(ETIQUETA_FOTO)
    expect(ind.valorAnterior).toBeNull()
    expect(ind.variacion).toBeNull()
    // No es «Nuevo» ni una baja: dice por qué no se compara.
    expect(textoVariacionIndicador(ind)).toBe(ETIQUETA_FOTO)
    expect(textoAnteriorIndicador(ind)).toBe("—")
  })

  it("sin comparativo y sin valor, la variación queda en «—»", () => {
    const ind = indicador({
      clave: "sin_ingreso",
      titulo: "Cuentas activas sin ingresos",
      actual: null,
      unidad: "conteo",
      sentido: "menor",
      sinComparativo: ETIQUETA_CUENTAS_DE_HOY,
    })
    expect(textoValorIndicador(ind)).toBe("—")
    expect(detalleIndicador(ind, true)).toBeUndefined()
  })
})

describe("textos para los documentos", () => {
  it("la cifra del PDF es corta: nunca lleva la explicación de la muestra", () => {
    const sinMuestra = indicador({
      clave: "cpm",
      titulo: "CPM efectivo",
      actual: 18_000,
      unidad: "COP",
      sentido: "menor",
      n: 3,
      nMinimo: 20,
    })
    expect(textoCifraIndicador(sinMuestra)).toBe("—")
    expect(detalleIndicador(sinMuestra, true)).toBe(
      "Muestra insuficiente (n = 3)"
    )

    const conValor = indicadorDesdeFila(fila(), 20)
    expect(plano(textoCifraIndicador(conValor))).toBe("$ 120.000.000")
  })

  it("el detalle lleva el comparativo solo si el reporte compara", () => {
    const ind = indicadorDesdeFila(fila(), 20)
    expect(plano(detalleIndicador(ind, true) ?? "")).toMatch(
      /^\+20,0\s?% vs\. anterior$/
    )
    expect(detalleIndicador(ind, false)).toBeUndefined()
  })

  it("el detalle explica lo nuevo, la foto y la muestra pequeña", () => {
    const nuevo = indicador({
      clave: "x",
      titulo: "X",
      actual: 5,
      anterior: 0,
      unidad: "conteo",
      sentido: "mayor",
    })
    expect(detalleIndicador(nuevo, true)).toBe(
      "Sin registro en el periodo anterior"
    )

    const foto = indicador({
      clave: "y",
      titulo: "Y",
      actual: 5,
      unidad: "conteo",
      sentido: "menor",
      sinComparativo: ETIQUETA_FOTO,
    })
    expect(detalleIndicador(foto, true)).toBe(ETIQUETA_FOTO)
    // El motivo se informa aunque el reporte no compare periodos.
    expect(detalleIndicador(foto, false)).toBe(ETIQUETA_FOTO)

    // Razón de una entidad concreta: el valor se muestra con su n al lado.
    const pequena = indicadorDesdeFila(
      fila({ kpi: "ticket_promedio", n: 4, variacion: 0.1 }),
      20
    )
    const detalle = detalleIndicador({ ...pequena, nMinimo: 5 }, true) ?? ""
    expect(detalle).toContain("n = 4")
  })

  it("sin datos y sin problema de muestra no hay detalle", () => {
    const ind = indicador({
      clave: "z",
      titulo: "Saldo al día",
      actual: null,
      anterior: null,
      unidad: "%",
      sentido: "mayor",
    })
    expect(textoValorIndicador(ind)).toBe("—")
    expect(detalleIndicador(ind, true)).toBeUndefined()
  })

  it("un cero sin cambios no inventa un comparativo", () => {
    const ind = indicador({
      clave: "c",
      titulo: "Alertas",
      actual: 0,
      anterior: 0,
      unidad: "conteo",
      sentido: "menor",
    })
    expect(textoValorIndicador(ind)).toBe("0")
    expect(textoVariacionIndicador(ind)).toBe("—")
    expect(detalleIndicador(ind, true)).toBeUndefined()
  })
})
