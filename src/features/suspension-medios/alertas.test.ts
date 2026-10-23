import { describe, expect, it } from "vitest"

import {
  leerDetalleAlerta,
  motivosAlerta,
  notaValidacion,
  ordenarAlertas,
  resumirAlertas,
  textoAlertaPrevia,
  textoEsperado,
} from "./alertas"

/** Como lo guarda `private.fn_metricas_alertas` (datos de la base local). */
const DETALLE = {
  factor: 3.0,
  alcance: 126931,
  multiplo: 2,
  seguidores: 44792,
  impresiones: 154546,
  n_historial: 8,
  limite_alcance: 89584,
  mediana_historica: 1718.5,
  mediana_impresiones: 2430,
}

describe("leerDetalleAlerta", () => {
  it("lee las cifras y las medianas, también si llegan como texto", () => {
    expect(
      leerDetalleAlerta({ ...DETALLE, mediana_historica: "1718.5" })
    ).toEqual({
      alcance: 126931,
      impresiones: 154546,
      medianaAlcance: 1718.5,
      medianaImpresiones: 2430,
      nHistorial: 8,
      factor: 3,
      seguidores: 44792,
      multiplo: 2,
      limiteAlcance: 89584,
      previa: null,
    })
  })

  it("tolera un detalle vacío o raro y calcula el límite si falta", () => {
    expect(leerDetalleAlerta(null).alcance).toBeNull()
    expect(leerDetalleAlerta([1, 2]).factor).toBeNull()
    expect(
      leerDetalleAlerta({ seguidores: 1000, multiplo: 2.5 }).limiteAlcance
    ).toBe(2500)
  })

  it("conserva la alerta previa a una corrección", () => {
    expect(
      leerDetalleAlerta({
        ...DETALLE,
        alerta_previa: {
          alcance: 200000,
          impresiones: 250000,
          desviacion: true,
          multiplo_superado: true,
        },
      }).previa
    ).toEqual({
      desviacion: true,
      multiploSuperado: true,
      alcance: 200000,
      impresiones: 250000,
    })
  })
})

describe("motivosAlerta", () => {
  const detalle = leerDetalleAlerta(DETALLE)

  it("explica el múltiplo con el límite por seguidores", () => {
    const [motivo] = motivosAlerta({
      multiplo: true,
      desviacion: false,
      detalle,
      plataforma: "INSTAGRAM",
    })
    expect(motivo.titulo).toBe("Alcance por encima de sus seguidores")
    expect(motivo.explicacion).toBe(
      "En Instagram se espera como máximo 2 × los 44.792 seguidores que tenía la cuenta al aceptar."
    )
    expect(motivo.comparaciones).toEqual([
      {
        cifra: "Alcance",
        reportado: 126931,
        minimo: null,
        maximo: 89584,
        referencia: "2 × 44.792 seguidores",
        fuera: true,
      },
    ])
  })

  it("explica la desviación con el rango de la mediana de la cuenta, cifra por cifra", () => {
    const [motivo] = motivosAlerta({
      multiplo: false,
      desviacion: true,
      detalle,
      plataforma: "INSTAGRAM",
    })
    expect(motivo.titulo).toBe("Fuera del histórico de la cuenta")
    expect(motivo.explicacion).toBe(
      "Se compara con la mediana de 8 métricas aprobadas de la misma cuenta en el mismo corte: se marca cuando una cifra pasa de 3 veces la mediana o no llega a la mediana dividida entre 3."
    )
    expect(motivo.comparaciones.map((c) => [c.cifra, c.fuera])).toEqual([
      ["Alcance", true],
      ["Impresiones", true],
    ])
    expect(motivo.comparaciones[0]).toMatchObject({
      minimo: 1718.5 / 3,
      maximo: 1718.5 * 3,
      referencia: "Mediana de la cuenta: 1.719",
    })
  })

  it("en TikTok habla de espectadores únicos y reproducciones", () => {
    const motivos = motivosAlerta({
      multiplo: true,
      desviacion: true,
      detalle,
      plataforma: "TIKTOK",
    })
    expect(motivos.map((motivo) => motivo.clave)).toEqual([
      "multiplo",
      "desviacion",
    ])
    expect(motivos[0].titulo).toBe(
      "Espectadores únicos por encima de sus seguidores"
    )
    expect(motivos[1].comparaciones.map((c) => c.cifra)).toEqual([
      "Espectadores únicos",
      "Reproducciones",
    ])
  })

  it("una cifra dentro del rango no queda marcada aunque la otra sí", () => {
    const [motivo] = motivosAlerta({
      multiplo: false,
      desviacion: true,
      detalle: leerDetalleAlerta({ ...DETALLE, alcance: 2000 }),
      plataforma: "FACEBOOK",
    })
    expect(motivo.comparaciones.map((c) => c.fuera)).toEqual([false, true])
  })

  it("sin cifras en el detalle sigue explicando la regla", () => {
    const motivos = motivosAlerta({
      multiplo: true,
      desviacion: true,
      detalle: leerDetalleAlerta({}),
      plataforma: null,
    })
    expect(motivos[0].explicacion).toBe(
      "Supera lo esperable para los seguidores de la cuenta."
    )
    expect(motivos[0].comparaciones).toEqual([])
    expect(motivos[1].explicacion).toBe(
      "Se compara con el histórico de la misma cuenta en el mismo corte."
    )
    expect(motivos[1].comparaciones).toEqual([])
  })

  it("sin alertas no hay motivos", () => {
    expect(
      motivosAlerta({
        multiplo: false,
        desviacion: false,
        detalle,
        plataforma: "INSTAGRAM",
      })
    ).toEqual([])
  })
})

describe("textos", () => {
  it("lo esperado es un tope o un rango", () => {
    expect(textoEsperado({ minimo: null, maximo: 89584 })).toBe("Hasta 89.584")
    expect(textoEsperado({ minimo: 572.83, maximo: 5155.5 })).toBe(
      "Entre 573 y 5.156"
    )
  })

  it("la alerta previa a una corrección se cuenta con sus cifras", () => {
    expect(
      textoAlertaPrevia(
        {
          desviacion: true,
          multiploSuperado: false,
          alcance: 9000,
          impresiones: 12000,
        },
        "TIKTOK"
      )
    ).toBe(
      "Antes de que el medio corrigiera las cifras ya tenía alerta (fuera del histórico de la cuenta): espectadores únicos 9.000, reproducciones 12.000."
    )
    expect(textoAlertaPrevia(null, "INSTAGRAM")).toBeNull()
    expect(
      textoAlertaPrevia(
        {
          desviacion: false,
          multiploSuperado: false,
          alcance: 1,
          impresiones: 1,
        },
        "INSTAGRAM"
      )
    ).toBeNull()
  })

  it("la nota de la validación dice qué se revisó, por qué se rechazó o que espera", () => {
    expect(
      notaValidacion({ estado: "APROBADA", observaciones: " Cuadra. " })
    ).toEqual({ etiqueta: "Lo que se revisó", texto: "Cuadra." })
    expect(
      notaValidacion({ estado: "RECHAZADA", observaciones: null })
    ).toEqual({
      etiqueta: "Motivo del rechazo",
      texto: "Se rechazó sin anotaciones.",
    })
    expect(
      notaValidacion({ estado: "PENDIENTE", observaciones: null }).etiqueta
    ).toBe("Por validar")
  })
})

describe("orden y resumen", () => {
  const alertas = [
    { metricaId: "a", estado: "APROBADA" as const, creadaAt: "2026-10-03" },
    { metricaId: "b", estado: "PENDIENTE" as const, creadaAt: "2026-09-01" },
    { metricaId: "c", estado: "RECHAZADA" as const, creadaAt: "2026-10-05" },
    { metricaId: "d", estado: "PENDIENTE" as const, creadaAt: "2026-10-01" },
  ]

  it("pone primero las que esperan validación y luego las más recientes", () => {
    expect(ordenarAlertas(alertas).map((alerta) => alerta.metricaId)).toEqual([
      "d",
      "b",
      "c",
      "a",
    ])
  })

  it("cuenta por estado de validación", () => {
    expect(resumirAlertas(alertas)).toEqual({
      total: 4,
      porValidar: 2,
      aprobadas: 1,
      rechazadas: 1,
    })
  })
})
