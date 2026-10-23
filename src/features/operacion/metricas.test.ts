import { describe, expect, it } from "vitest"

import {
  type CorteMetrica,
  datosAlerta,
  describirAlertaPrevia,
  describirAlertas,
  desvioFrente,
  engagement,
  indexarAlertas,
  leerDetalleAlertas,
  nombresColumnas,
  ordenarCortes,
  tieneAlerta,
  tuvoAlertaPrevia,
} from "./metricas"

const SIN_DETALLE = leerDetalleAlertas(null)

describe("nombresColumnas", () => {
  it("TikTok habla de espectadores y reproducciones", () => {
    expect(nombresColumnas("TIKTOK")).toEqual({
      alcance: "Espectadores únicos",
      impresiones: "Reproducciones",
    })
    expect(nombresColumnas("INSTAGRAM").alcance).toBe("Alcance")
  })
})

describe("engagement", () => {
  it("interacciones sobre alcance; sin alcance no hay tasa", () => {
    expect(engagement(50, 1_000)).toBe(0.05)
    expect(engagement(50, 0)).toBeNull()
    expect(engagement(null, 1_000)).toBeNull()
  })
})

describe("ordenarCortes", () => {
  it("24 h → 72 h → 7 días → personalizado, y por fecha dentro del mismo", () => {
    const ordenados = ordenarCortes([
      { corte: "D7" as const, fechaCorte: "2026-09-08" },
      { corte: "PERSONALIZADO" as const, fechaCorte: "2026-09-03" },
      { corte: "H24" as const, fechaCorte: "2026-09-02" },
      { corte: "PERSONALIZADO" as const, fechaCorte: "2026-09-01" },
    ])
    expect(ordenados.map((c) => `${c.corte}@${c.fechaCorte}`)).toEqual([
      "H24@2026-09-02",
      "D7@2026-09-08",
      "PERSONALIZADO@2026-09-01",
      "PERSONALIZADO@2026-09-03",
    ])
  })
})

describe("alertas de integridad", () => {
  it("lee el jsonb tolerando faltantes y textos numéricos", () => {
    expect(
      leerDetalleAlertas({
        mediana_historica: "1200",
        n_historial: 8,
        factor: 3,
        otro: true,
      })
    ).toEqual({
      ...SIN_DETALLE,
      medianaHistorica: 1_200,
      nHistorial: 8,
      factor: 3,
    })
    expect(leerDetalleAlertas([1, 2])).toEqual(SIN_DETALLE)
    expect(SIN_DETALLE.alertaPrevia).toBeNull()
  })

  it("lee las cifras evaluadas, el límite y la alerta previa", () => {
    const detalle = leerDetalleAlertas({
      mediana_historica: 10_000,
      mediana_impresiones: 14_000,
      n_historial: 6,
      factor: 3,
      seguidores: 40_000,
      multiplo: 2,
      alcance: 30_000,
      impresiones: 41_000,
      limite_alcance: 80_000,
      alerta_previa: {
        alcance: 95_000,
        seguidores: 40_000,
        multiplo: 2,
        limite_alcance: 80_000,
        desviacion: false,
        multiplo_superado: true,
      },
    })
    expect(detalle).toMatchObject({
      medianaImpresiones: 14_000,
      alcance: 30_000,
      impresiones: 41_000,
      limiteAlcance: 80_000,
    })
    expect(detalle.alertaPrevia).toMatchObject({
      alcance: 95_000,
      desviacion: false,
      multiploSuperado: true,
    })
  })

  it("INT-004: el alcance sobre el múltiplo de seguidores, con el límite", () => {
    const corte = {
      alertaDesviacion: false,
      alertaMultiplo: true,
      alcance: 95_000,
      detalleAlertas: {
        ...SIN_DETALLE,
        seguidores: 40_000,
        multiplo: 2,
        alcance: 95_000,
        limiteAlcance: 80_000,
      },
    }
    expect(describirAlertas(corte)).toEqual([
      "El alcance reportado (95.000) supera lo esperable para sus seguidores (límite: 2 × 40.000 seguidores = 80.000).",
    ])
    expect(datosAlerta(corte)).toEqual([
      { etiqueta: "Alcance reportado", valor: "95.000" },
      { etiqueta: "Seguidores al aceptar", valor: "40.000" },
      { etiqueta: "Múltiplo permitido", valor: "2 ×" },
      { etiqueta: "Límite de alcance", valor: "80.000" },
    ])
  })

  it("INT-003: dice qué cifra se desvía de la mediana de la cuenta y hacia dónde", () => {
    const corte = {
      alertaDesviacion: true,
      alertaMultiplo: false,
      alcance: 45_000,
      impresiones: 4_000,
      detalleAlertas: {
        ...SIN_DETALLE,
        medianaHistorica: 10_000,
        medianaImpresiones: 15_000,
        nHistorial: 8,
        factor: 3,
      },
    }
    const [motivo] = describirAlertas(corte)
    expect(motivo).toBe(
      "Se desvía del histórico de la cuenta (8 métricas aprobadas de la cuenta en este corte): el alcance (45.000) es más de 3 veces la mediana (10.000); las impresiones (4.000) son menos que la mediana (15.000) dividida entre 3."
    )
    expect(datosAlerta(corte).map((dato) => dato.etiqueta)).toEqual([
      "Alcance reportado",
      "Impresiones reportadas",
      "Mediana histórica (alcance)",
      "Mediana histórica (impresiones)",
      "Factor de desviación",
      "Métricas en el histórico",
    ])
  })

  it("en TikTok habla de espectadores únicos y reproducciones", () => {
    const corte = {
      alertaDesviacion: true,
      alertaMultiplo: true,
      alcance: 900_000,
      detalleAlertas: {
        ...SIN_DETALLE,
        seguidores: 40_000,
        multiplo: 20,
        limiteAlcance: 800_000,
        medianaHistorica: 100_000,
        factor: 3,
      },
    }
    const [multiplo, desviacion] = describirAlertas(corte, "TIKTOK")
    expect(multiplo).toMatch(
      /^Los espectadores únicos reportados \(900\.000\) superan lo esperable/
    )
    expect(desviacion).toMatch(
      /los espectadores únicos \(900\.000\) son más de 3 veces la mediana/
    )
    expect(datosAlerta(corte, "TIKTOK")[0]).toEqual({
      etiqueta: "Espectadores únicos reportados",
      valor: "900.000",
    })
  })

  it("con el detalle anterior (sin cifras evaluadas) da la referencia general", () => {
    const corte: Pick<
      CorteMetrica,
      "alertaDesviacion" | "alertaMultiplo" | "detalleAlertas" | "alcance"
    > = {
      alertaDesviacion: true,
      alertaMultiplo: true,
      alcance: null,
      detalleAlertas: {
        ...SIN_DETALLE,
        medianaHistorica: 12_000,
        nHistorial: 6,
        factor: 3,
        seguidores: 40_000,
        multiplo: 1.5,
      },
    }
    const [multiplo, desviacion] = describirAlertas(corte)
    expect(multiplo).toMatch(/supera lo esperable.*1,5 × 40\.000 seguidores/)
    expect(desviacion).toMatch(/histórico.*12\.000.*3 ×/)
    expect(tieneAlerta(corte)).toBe(true)
  })

  it("una alerta corregida por el medio persiste como alerta previa", () => {
    const corte = {
      alertaDesviacion: false,
      alertaMultiplo: false,
      alcance: 30_000,
      detalleAlertas: {
        ...SIN_DETALLE,
        alertaPrevia: {
          ...SIN_DETALLE,
          alcance: 95_000,
          seguidores: 40_000,
          multiplo: 2,
          limiteAlcance: 80_000,
          desviacion: false,
          multiploSuperado: true,
        },
      },
    }
    expect(tieneAlerta(corte)).toBe(false)
    expect(tuvoAlertaPrevia(corte)).toBe(true)
    expect(describirAlertaPrevia(corte)).toBe(
      "Antes de que el medio corrigiera las cifras tuvo alerta. El alcance reportado (95.000) supera lo esperable para sus seguidores (límite: 2 × 40.000 seguidores = 80.000)."
    )
    expect(describirAlertaPrevia({ detalleAlertas: SIN_DETALLE })).toBeNull()
  })

  it("sin alertas no hay motivos ni datos", () => {
    const corte = {
      alertaDesviacion: false,
      alertaMultiplo: false,
      alcance: 10,
      detalleAlertas: SIN_DETALLE,
    }
    expect(describirAlertas(corte)).toEqual([])
    expect(datosAlerta(corte)).toEqual([])
    expect(tieneAlerta(corte)).toBe(false)
    expect(tuvoAlertaPrevia(corte)).toBe(false)
  })
})

describe("desvioFrente", () => {
  it("alto sobre mediana × factor, bajo bajo mediana ÷ factor, sin dato no decide", () => {
    expect(desvioFrente(45_000, 10_000, 3)).toBe("alto")
    expect(desvioFrente(30_000, 10_000, 3)).toBeNull()
    expect(desvioFrente(3_000, 10_000, 3)).toBe("bajo")
    expect(desvioFrente(3_400, 10_000, 3)).toBeNull()
    expect(desvioFrente(null, 10_000, 3)).toBeNull()
    expect(desvioFrente(10, 0, 3)).toBeNull()
  })
})

describe("indexarAlertas", () => {
  it("indexa por métrica y deja sin alertas a la que no aparece", () => {
    const alertasDe = indexarAlertas([
      {
        metrica_id: "m1",
        alerta_desviacion: false,
        alerta_multiplo: true,
        detalle_alertas: { seguidores: 40_000 },
      },
    ])
    expect(alertasDe("m1")).toMatchObject({
      alertaMultiplo: true,
      alertaDesviacion: false,
      detalleAlertas: { seguidores: 40_000 },
    })
    expect(alertasDe("m2")).toEqual({
      alertaDesviacion: false,
      alertaMultiplo: false,
      detalleAlertas: SIN_DETALLE,
    })
  })
})
