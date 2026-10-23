import { describe, expect, it } from "vitest"

import { formatearNumero, formatearPorcentaje } from "@/lib/format"

import {
  alertaRevisable,
  camposSenalados,
  datosMotivo,
  explicarMotivo,
  frasesAlerta,
  indexarAlertas,
  leerAlerta,
  motivosAlerta,
  motivosAlertaPrevia,
  resumirMotivo,
  SIN_ALERTA,
  textoHistorial,
  tieneAlerta,
  tituloMotivo,
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

/** El medio corrigió el alcance de 95.000 a 60.000: ya no dispara, pero la tuvo. */
const CORREGIDA = {
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
}

describe("leerAlerta", () => {
  it("lee las marcas y todo el detalle, incluidos los números que llegan como texto", () => {
    const alerta = leerAlerta(DESVIACION)
    expect(alerta).toEqual({
      desviacion: true,
      multiplo: false,
      cifras: {
        medianaAlcance: 10000,
        medianaImpresiones: 30000,
        nHistorial: 8,
        factor: 3,
        seguidores: 100000,
        multiplo: 2,
        alcance: 45000,
        impresiones: 60000,
        limiteAlcance: 200000,
      },
      previa: null,
    })
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

  it("calcula el límite si el detalle no lo guardó", () => {
    expect(
      leerAlerta({
        ...MULTIPLO,
        detalle_alertas: { seguidores: 1000, multiplo: 2.5 },
      }).cifras.limiteAlcance
    ).toBe(2500)
  })

  it("conserva la alerta que tuvo antes de corregirse, con sus cifras de entonces", () => {
    const alerta = leerAlerta(CORREGIDA)
    expect(tieneAlerta(alerta)).toBe(false)
    expect(alertaRevisable(alerta)).toBe(true)
    expect(alerta.previa?.multiplo).toBe(true)
    expect(alerta.previa?.cifras.alcance).toBe(95000)
    expect(alerta.cifras.alcance).toBe(60000)
  })

  it("la alerta previa cuenta con solo existir, como en la BD", () => {
    const alerta = leerAlerta({
      alerta_desviacion: false,
      alerta_multiplo: false,
      detalle_alertas: {
        alerta_previa: { desviacion: false, multiplo_superado: false },
      },
    })
    expect(alertaRevisable(alerta)).toBe(true)
    expect(motivosAlertaPrevia(alerta, "INSTAGRAM")).toEqual([])
    expect(alertaRevisable(leerAlerta(MULTIPLO))).toBe(true)
    expect(alertaRevisable(SIN_ALERTA)).toBe(false)
  })
})

describe("indexarAlertas", () => {
  it("indexa por métrica y deja sin alerta a la que no aparece", () => {
    const alertaDe = indexarAlertas([{ metrica_id: "m1", ...MULTIPLO }])
    expect(alertaDe("m1")).toMatchObject({
      multiplo: true,
      desviacion: false,
      cifras: { seguidores: 40000, limiteAlcance: 80000 },
    })
    expect(alertaDe("m2")).toEqual(SIN_ALERTA)
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
    expect(tituloMotivo(motivo)).toBe(
      "Alcance excesivo frente a los seguidores"
    )
    expect(explicarMotivo(motivo)).toBe(
      `El alcance (${formatearNumero(95000)}) supera el límite de ${formatearNumero(80000)}: 2 × los ${formatearNumero(40000)} seguidores que tenía la cuenta al aceptar.`
    )
    expect(resumirMotivo(motivo)).toBe("Alcance sobre el límite por seguidores")
    expect(datosMotivo(motivo)).toEqual([
      { etiqueta: "Alcance reportado", valor: "95.000", destacado: true },
      { etiqueta: "Seguidores al aceptar", valor: "40.000" },
      { etiqueta: "Múltiplo permitido", valor: "2 ×" },
      { etiqueta: "Límite", valor: "80.000" },
    ])
  })

  it("múltiplo sin cifras: sigue explicando la regla", () => {
    const [motivo] = motivosAlerta(
      leerAlerta({ ...MULTIPLO, detalle_alertas: {} }),
      null
    )
    expect(explicarMotivo(motivo)).toBe(
      "El alcance supera el límite por los seguidores de la cuenta."
    )
    expect(datosMotivo(motivo).map((dato) => dato.valor)).toEqual([
      "—",
      "—",
      "—",
      "—",
    ])
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
    expect(tituloMotivo(motivo)).toBe(
      "Alcance fuera del histórico de la cuenta"
    )
    expect(explicarMotivo(motivo)).toBe(
      `El alcance (${formatearNumero(45000)}) es ${formatearNumero(4.5, 1)} veces la mediana de la cuenta en este corte (${formatearNumero(10000)}); se alerta por encima de ${formatearNumero(30000)} (3 × la mediana).`
    )
    expect(resumirMotivo(motivo)).toBe(
      `Alcance: ${formatearNumero(4.5, 1)} veces su mediana`
    )
    expect(datosMotivo(motivo)).toContainEqual({
      etiqueta: "Rango sin alerta",
      valor: `${formatearNumero(3334)} – ${formatearNumero(30000)}`,
    })
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
    expect(datosMotivo(motivo)[0].etiqueta).toBe("Reproducciones reportadas")
  })

  it("en TikTok el múltiplo habla de espectadores únicos (plural)", () => {
    const [motivo] = motivosAlerta(leerAlerta(MULTIPLO), "TIKTOK")
    expect(explicarMotivo(motivo)).toMatch(
      /^Los espectadores únicos .* superan/
    )
    expect(tituloMotivo(motivo)).toBe(
      "Espectadores únicos excesivos frente a los seguidores"
    )
    expect(datosMotivo(motivo)[0].etiqueta).toBe(
      "Espectadores únicos reportados"
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
    expect(datosMotivo(motivos[0])).toEqual([])
  })

  it("con alcance e impresiones fuera de rango, dos razones; una cifra dentro no se marca", () => {
    const ambas = motivosAlerta(
      leerAlerta({
        ...DESVIACION,
        detalle_alertas: {
          ...DESVIACION.detalle_alertas,
          impresiones: 200000,
        },
      }),
      "INSTAGRAM"
    )
    expect(ambas.map((motivo) => motivo.tipo)).toEqual([
      "desviacion",
      "desviacion",
    ])
    expect(motivosAlerta(leerAlerta(DESVIACION), "INSTAGRAM")).toHaveLength(1)
  })

  it("la alerta previa tiene sus propias razones", () => {
    const alerta = leerAlerta(CORREGIDA)
    expect(motivosAlerta(alerta, "INSTAGRAM")).toEqual([])
    expect(motivosAlertaPrevia(alerta, "INSTAGRAM")).toEqual([
      expect.objectContaining({ tipo: "multiplo", reportado: 95000 }),
    ])
    expect(motivosAlertaPrevia(leerAlerta(MULTIPLO), "INSTAGRAM")).toEqual([])
  })

  it("sin alertas no hay motivos", () => {
    expect(motivosAlerta(SIN_ALERTA, "INSTAGRAM")).toEqual([])
  })
})

describe("frasesAlerta", () => {
  it("las razones de hoy, en frases", () => {
    expect(frasesAlerta(leerAlerta(MULTIPLO), "INSTAGRAM")).toEqual([
      explicarMotivo(motivosAlerta(leerAlerta(MULTIPLO), "INSTAGRAM")[0]),
    ])
    expect(frasesAlerta(SIN_ALERTA, "INSTAGRAM")).toEqual([])
  })

  it("una corregida dice que tuvo alerta y por qué", () => {
    const [titulo, razon] = frasesAlerta(leerAlerta(CORREGIDA), "INSTAGRAM")
    expect(titulo).toBe("Tuvo alerta antes de corregirse.")
    expect(razon).toMatch(/^El alcance \(95\.000\) supera el límite/)
  })

  it("con alerta hoy y antes, dice que también la tenía", () => {
    const frases = frasesAlerta(
      leerAlerta({
        ...DESVIACION,
        detalle_alertas: {
          ...DESVIACION.detalle_alertas,
          alerta_previa: {
            ...MULTIPLO.detalle_alertas,
            multiplo_superado: true,
          },
        },
      }),
      "INSTAGRAM"
    )
    expect(frases).toHaveLength(3)
    expect(frases[1]).toBe("Antes de corregirse también tenía alerta.")
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

  it("también lo que señaló la alerta previa a la corrección", () => {
    expect(camposSenalados(leerAlerta(CORREGIDA), "INSTAGRAM")).toEqual([
      "alcance",
    ])
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
