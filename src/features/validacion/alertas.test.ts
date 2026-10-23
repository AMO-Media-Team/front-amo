import { describe, expect, it } from "vitest"

import { formatearNumero, formatearPorcentaje } from "@/lib/format"

import {
  camposSenalados,
  explicarMotivo,
  leerAlerta,
  motivosAlerta,
  motivosAlertaPrevia,
  resumirMotivo,
  SIN_ALERTA,
  textoHistorial,
  tieneAlerta,
  tuvoAlerta,
} from "./alertas"

/** INT-004: Instagram con 40.000 seguidores reporta 95.000 de alcance. */
const MULTIPLO = {
  alerta_desviacion: false,
  alerta_multiplo: true,
  detalle_alertas: {
    multiplo: 2,
    seguidores: 40000,
    alcance: 95000,
    impresiones: 120000,
    limite_alcance: 80000,
    mediana_historica: null,
    mediana_impresiones: null,
    n_historial: 2,
    factor: 3,
  },
}

/** INT-003: mediana de 10.000 y un reporte de 45.000 (factor 3). */
const DESVIACION = {
  alerta_desviacion: true,
  alerta_multiplo: false,
  detalle_alertas: {
    multiplo: 2,
    seguidores: 100000,
    alcance: 45000,
    impresiones: 60000,
    limite_alcance: 200000,
    mediana_historica: 10000,
    mediana_impresiones: 30000,
    n_historial: 8,
    factor: "3.0",
  },
}

describe("leerAlerta", () => {
  it("lee las marcas y el detalle, incluidos los números que llegan como texto", () => {
    const alerta = leerAlerta(DESVIACION)
    expect(alerta.desviacion).toBe(true)
    expect(alerta.multiplo).toBe(false)
    expect(alerta.cifras.factor).toBe(3)
    expect(alerta.cifras.medianaAlcance).toBe(10000)
    expect(alerta.cifras.nHistorial).toBe(8)
    expect(alerta.previa).toBeNull()
  })

  it("tolera un detalle vacío o que no es objeto", () => {
    expect(
      leerAlerta({
        alerta_desviacion: null,
        alerta_multiplo: null,
        detalle_alertas: [1, 2],
      })
    ).toEqual(SIN_ALERTA)
  })

  it("conserva la alerta que tuvo antes de corregirse", () => {
    const alerta = leerAlerta({
      alerta_desviacion: false,
      alerta_multiplo: false,
      detalle_alertas: {
        ...MULTIPLO.detalle_alertas,
        alcance: 60000,
        alerta_previa: {
          ...MULTIPLO.detalle_alertas,
          desviacion: false,
          multiplo_superado: true,
        },
      },
    })
    expect(tieneAlerta(alerta)).toBe(false)
    expect(tuvoAlerta(alerta)).toBe(true)
    expect(alerta.previa?.multiplo).toBe(true)
    expect(alerta.previa?.cifras.alcance).toBe(95000)
  })

  it("una alerta previa sin marcas no cuenta", () => {
    const alerta = leerAlerta({
      alerta_desviacion: false,
      alerta_multiplo: false,
      detalle_alertas: {
        alerta_previa: { desviacion: false, multiplo_superado: false },
      },
    })
    expect(alerta.previa).toBeNull()
    expect(tuvoAlerta(alerta)).toBe(false)
  })
})

describe("motivosAlerta", () => {
  it("múltiplo: el alcance reportado frente al límite de los seguidores (ADM-008 c1)", () => {
    const [motivo] = motivosAlerta(leerAlerta(MULTIPLO), "INSTAGRAM")
    expect(motivo).toEqual({
      tipo: "multiplo",
      nombre: "Alcance",
      reportado: 95000,
      limite: 80000,
      seguidores: 40000,
      multiplo: 2,
    })
    expect(explicarMotivo(motivo)).toBe(
      `El alcance (${formatearNumero(95000)}) supera el límite de ${formatearNumero(80000)}: 2 × los ${formatearNumero(40000)} seguidores que tenía la cuenta al aceptar.`
    )
    expect(resumirMotivo(motivo)).toBe("Alcance sobre el límite por seguidores")
  })

  it("múltiplo sin límite guardado: lo calcula con el múltiplo y los seguidores", () => {
    const [motivo] = motivosAlerta(
      leerAlerta({
        ...MULTIPLO,
        detalle_alertas: { ...MULTIPLO.detalle_alertas, limite_alcance: null },
      }),
      "INSTAGRAM"
    )
    expect(motivo).toMatchObject({ tipo: "multiplo", limite: 80000 })
  })

  it("desviación por encima: mediana, factor y rango sin alerta", () => {
    const motivos = motivosAlerta(leerAlerta(DESVIACION), "FACEBOOK")
    expect(motivos).toHaveLength(1)
    const [motivo] = motivos
    expect(motivo).toMatchObject({
      tipo: "desviacion",
      medida: "alcance",
      sentido: "sobre",
      mediana: 10000,
      factor: 3,
      maximo: 30000,
      proporcion: 4.5,
    })
    expect(explicarMotivo(motivo)).toBe(
      `El alcance (${formatearNumero(45000)}) es ${formatearNumero(4.5, 1)} veces la mediana de la cuenta en este corte (${formatearNumero(10000)}); se alerta por encima de ${formatearNumero(30000)} (3 × la mediana).`
    )
    expect(resumirMotivo(motivo)).toBe(
      `Alcance: ${formatearNumero(4.5, 1)} veces su mediana`
    )
  })

  it("desviación por debajo en TikTok: reproducciones, en plural", () => {
    const [motivo] = motivosAlerta(
      leerAlerta({
        alerta_desviacion: true,
        alerta_multiplo: false,
        detalle_alertas: {
          alcance: 5000,
          impresiones: 2000,
          mediana_historica: 5000,
          mediana_impresiones: 10000,
          factor: 3,
          n_historial: 6,
        },
      }),
      "TIKTOK"
    )
    expect(motivo).toMatchObject({
      tipo: "desviacion",
      medida: "impresiones",
      nombre: "Reproducciones",
      sentido: "bajo",
    })
    expect(explicarMotivo(motivo)).toBe(
      `Las reproducciones (${formatearNumero(2000)}) equivalen al ${formatearPorcentaje(0.2, 0)} de la mediana de la cuenta en este corte (${formatearNumero(10000)}); se alerta por debajo de ${formatearNumero(10000 / 3)} (la mediana ÷ 3).`
    )
  })

  it("en TikTok el múltiplo habla de espectadores únicos (plural)", () => {
    const [motivo] = motivosAlerta(leerAlerta(MULTIPLO), "TIKTOK")
    expect(explicarMotivo(motivo)).toMatch(
      /^Los espectadores únicos .* superan/
    )
  })

  it("una desviación sin detalle se explica igual", () => {
    const motivos = motivosAlerta(
      leerAlerta({
        alerta_desviacion: true,
        alerta_multiplo: false,
        detalle_alertas: {},
      }),
      "INSTAGRAM"
    )
    expect(motivos).toEqual([
      { tipo: "desviacion-sin-detalle", nHistorial: null },
    ])
    expect(explicarMotivo(motivos[0])).toMatch(/histórico de la cuenta/)
  })

  it("con alcance e impresiones fuera de rango, dos razones", () => {
    const motivos = motivosAlerta(
      leerAlerta({
        ...DESVIACION,
        detalle_alertas: {
          ...DESVIACION.detalle_alertas,
          impresiones: 200000,
        },
      }),
      "INSTAGRAM"
    )
    expect(motivos.map((motivo) => motivo.tipo)).toEqual([
      "desviacion",
      "desviacion",
    ])
  })

  it("la alerta previa tiene sus propias razones", () => {
    const alerta = leerAlerta({
      alerta_desviacion: false,
      alerta_multiplo: false,
      detalle_alertas: {
        alerta_previa: { ...MULTIPLO.detalle_alertas, multiplo_superado: true },
      },
    })
    expect(motivosAlerta(alerta, "INSTAGRAM")).toEqual([])
    expect(motivosAlertaPrevia(alerta, "INSTAGRAM")).toHaveLength(1)
    expect(motivosAlertaPrevia(leerAlerta(MULTIPLO), "INSTAGRAM")).toEqual([])
  })
})

describe("camposSenalados", () => {
  it("resalta el alcance (o los espectadores únicos) y las impresiones que se desvían", () => {
    expect(camposSenalados(leerAlerta(MULTIPLO), "INSTAGRAM")).toEqual([
      "alcance",
    ])
    expect(camposSenalados(leerAlerta(MULTIPLO), "TIKTOK")).toEqual([
      "espectadoresUnicos",
    ])
    expect(camposSenalados(SIN_ALERTA, "FACEBOOK")).toEqual([])
  })
})

describe("textoHistorial", () => {
  it("dice con cuántas métricas se calculó la mediana", () => {
    expect(textoHistorial(8)).toBe(
      "Mediana calculada con 8 métricas aprobadas de la misma cuenta en este corte."
    )
    expect(textoHistorial(1)).toMatch(/1 métrica aprobada /)
    expect(textoHistorial(0)).toBeNull()
    expect(textoHistorial(null)).toBeNull()
  })
})
