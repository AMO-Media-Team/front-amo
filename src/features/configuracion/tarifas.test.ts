import { describe, expect, it } from "vitest"

import {
  celdaDe,
  construirMatriz,
  franjasVisibles,
  historialCelda,
  inicioProgramable,
  inicioSugerido,
  inicioUltimaProgramada,
  ordenarVersiones,
  resumirTarifas,
  tarifasPendientes,
  versionesPorCelda,
} from "./tarifas"
import type { Formato, Franja, Tarifa } from "./tipos"

// Lunes 5 de octubre de 2026, 10:00 en Bogotá.
const AHORA = new Date("2026-10-05T15:00:00Z")

function franja(clave: string, orden: number, activa = true): Franja {
  return {
    id: `franja-${clave}`,
    clave,
    nombre: clave,
    seguidoresMin: orden * 30_000,
    seguidoresMax: null,
    orden,
    activa,
    actualizadoAt: "2026-01-01T00:00:00Z",
  }
}

function formato(
  clave: string,
  plataforma: Formato["plataforma"],
  orden = 0,
  activo = true
): Formato {
  return {
    id: `formato-${plataforma}-${clave}`,
    plataforma,
    clave,
    nombre: clave,
    requisitos: {
      relacionesAspecto: [],
      mime: [],
      duracionMaxS: null,
      pesoMaxMb: null,
      maxArchivos: null,
    },
    activo,
    orden,
    actualizadoAt: "2026-01-01T00:00:00Z",
  }
}

let consecutivo = 0
function tarifa(
  f: Formato,
  fr: Franja,
  valorBase: number,
  vigenteDesde: string,
  vigenteHasta: string | null = null,
  pendienteValidacion = false
): Tarifa {
  consecutivo += 1
  return {
    id: `tarifa-${consecutivo}`,
    formatoId: f.id,
    plataforma: f.plataforma,
    franjaId: fr.id,
    valorBase,
    vigenteDesde,
    vigenteHasta,
    pendienteValidacion,
    creadaAt: vigenteDesde,
    creadaPor: null,
  }
}

const F1 = franja("F1", 1)
const F2 = franja("F2", 2)
const F9 = franja("F9", 9, false)
const REEL = formato("REEL", "INSTAGRAM", 1)
const HISTORIA = formato("HISTORIA", "INSTAGRAM", 2)
const VIDEO = formato("VIDEO", "TIKTOK")

const ENERO = "2026-01-01T05:00:00Z"
const JULIO = "2026-07-01T05:00:00Z"
const NOVIEMBRE = "2026-11-01T05:00:00Z"
const DICIEMBRE = "2026-12-01T05:00:00Z"

describe("celdaDe", () => {
  it("separa la vigente de la próxima programada y calcula la variación", () => {
    const versiones = [
      tarifa(REEL, F1, 100_000, ENERO, JULIO),
      tarifa(REEL, F1, 120_000, JULIO, NOVIEMBRE),
      tarifa(REEL, F1, 150_000, NOVIEMBRE, DICIEMBRE),
      tarifa(REEL, F1, 180_000, DICIEMBRE),
    ]
    const celda = celdaDe(versiones, REEL.id, F1.id, AHORA)
    expect(celda.vigente?.valorBase).toBe(120_000)
    expect(celda.programada?.valorBase).toBe(150_000)
    expect(celda.variacion).toBeCloseTo(0.25)
  })

  it("una celda sin versiones no tiene tarifa ni variación", () => {
    expect(celdaDe([], REEL.id, F1.id, AHORA)).toEqual({
      formatoId: REEL.id,
      franjaId: F1.id,
      vigente: null,
      programada: null,
      variacion: null,
    })
  })
})

describe("matriz", () => {
  const tarifas = [
    tarifa(REEL, F1, 100_000, ENERO),
    tarifa(HISTORIA, F2, 80_000, ENERO),
    tarifa(VIDEO, F9, 50_000, ENERO),
  ]

  it("muestra las franjas activas y las inactivas que aún tienen tarifas", () => {
    expect(franjasVisibles([F2, F9, F1], tarifas).map((f) => f.clave)).toEqual([
      "F1",
      "F2",
      "F9",
    ])
    expect(franjasVisibles([F2, F9, F1], []).map((f) => f.clave)).toEqual([
      "F1",
      "F2",
    ])
  })

  it("agrupa por plataforma en orden fijo y por formato en su orden", () => {
    const matriz = construirMatriz(
      [VIDEO, HISTORIA, REEL],
      [F1, F2],
      tarifas,
      AHORA
    )
    expect(matriz.map((g) => g.plataforma)).toEqual(["INSTAGRAM", "TIKTOK"])
    expect(matriz[0].filas.map((f) => f.formato.clave)).toEqual([
      "REEL",
      "HISTORIA",
    ])
    expect(
      matriz[0].filas[0].celdas.map((c) => c.vigente?.valorBase ?? null)
    ).toEqual([100_000, null])
  })

  it("agrupa las versiones de cada celda de la más reciente a la más antigua", () => {
    const versiones = versionesPorCelda([
      tarifa(REEL, F1, 1, ENERO, JULIO),
      tarifa(REEL, F1, 2, JULIO),
      tarifa(REEL, F2, 3, ENERO),
    ])
    expect(
      versiones.get(`${REEL.id}:${F1.id}`)?.map((t) => t.valorBase)
    ).toEqual([2, 1])
    expect(versiones.size).toBe(2)
  })

  it("el historial de una celda lleva el estado de cada versión", () => {
    const lista = [
      tarifa(REEL, F1, 1, ENERO, JULIO),
      tarifa(REEL, F1, 2, JULIO, NOVIEMBRE),
      tarifa(REEL, F1, 3, NOVIEMBRE),
    ]
    expect(
      historialCelda(lista, REEL.id, F1.id, AHORA).map((t) => t.estado)
    ).toEqual(["PROGRAMADA", "VIGENTE", "FINALIZADA"])
    expect(historialCelda(lista, REEL.id, F2.id, AHORA)).toEqual([])
  })
})

describe("resumirTarifas", () => {
  it("cuenta vigentes, programadas, pendientes y celdas activas sin tarifa", () => {
    const inactivo = formato("VIDEO", "FACEBOOK", 0, false)
    const tarifas = [
      tarifa(REEL, F1, 100_000, ENERO, NOVIEMBRE, true),
      tarifa(REEL, F1, 110_000, NOVIEMBRE, null, true),
      tarifa(REEL, F2, 90_000, ENERO, JULIO, true),
      tarifa(HISTORIA, F1, 70_000, DICIEMBRE),
    ]
    const resumen = resumirTarifas(
      [REEL, HISTORIA, inactivo],
      [F1, F2, F9],
      tarifas,
      AHORA
    )
    expect(resumen).toEqual({
      vigentes: 1,
      // REEL×F2 (finalizada), HISTORIA×F1 (solo programada) e HISTORIA×F2.
      sinTarifa: 3,
      programadas: 2,
      // La finalizada ya no cuenta como pendiente de validación.
      pendientes: 2,
      proximoCambio: NOVIEMBRE,
    })
  })

  it("sin tarifas programadas no hay próximo cambio", () => {
    const resumen = resumirTarifas(
      [REEL],
      [F1],
      [tarifa(REEL, F1, 1, ENERO)],
      AHORA
    )
    expect(resumen.proximoCambio).toBeNull()
    expect(resumen.sinTarifa).toBe(0)
  })

  it("lista los ids por validar que siguen en uso", () => {
    const vigente = tarifa(REEL, F1, 1, ENERO, null, true)
    const cerrada = tarifa(REEL, F2, 1, ENERO, JULIO, true)
    const validada = tarifa(HISTORIA, F1, 1, ENERO)
    expect(tarifasPendientes([vigente, cerrada, validada], AHORA)).toEqual([
      vigente.id,
    ])
  })
})

describe("ordenarVersiones", () => {
  it("pone primero la más reciente y, a igual fecha, sigue el orden de la matriz", () => {
    // La semilla empieza toda el mismo día: sin desempate la lista sale revuelta.
    const tiktok = tarifa(VIDEO, F1, 300_000, ENERO)
    const historiaF2 = tarifa(HISTORIA, F2, 220_000, ENERO)
    const reelF2 = tarifa(REEL, F2, 650_000, ENERO)
    const reelF1 = tarifa(REEL, F1, 350_000, ENERO, NOVIEMBRE)
    const reelF1Nueva = tarifa(REEL, F1, 400_000, NOVIEMBRE)

    expect(
      ordenarVersiones(
        [tiktok, historiaF2, reelF2, reelF1, reelF1Nueva],
        [VIDEO, HISTORIA, REEL],
        [F2, F1]
      ).map((t) => t.id)
    ).toEqual([reelF1Nueva.id, reelF1.id, reelF2.id, historiaF2.id, tiktok.id])
  })

  it("deja al final lo que no encuentra en los catálogos, sin fallar", () => {
    const conocida = tarifa(REEL, F1, 100_000, ENERO)
    const huerfana = tarifa(HISTORIA, F9, 90_000, ENERO)
    expect(
      ordenarVersiones([huerfana, conocida], [REEL], [F1]).map((t) => t.id)
    ).toEqual([conocida.id, huerfana.id])
  })
})

describe("programación de una nueva vigencia", () => {
  const sinProgramadas = [tarifa(REEL, F1, 100_000, ENERO)]
  const conProgramada = [
    tarifa(REEL, F1, 100_000, ENERO, NOVIEMBRE),
    tarifa(REEL, F1, 120_000, NOVIEMBRE),
  ]

  it("debe empezar en el futuro", () => {
    expect(inicioProgramable(AHORA, sinProgramadas, AHORA)).toBe(false)
    expect(
      inicioProgramable(
        new Date(AHORA.getTime() + 60_000),
        sinProgramadas,
        AHORA
      )
    ).toBe(true)
  })

  it("debe empezar después de la última programada", () => {
    expect(inicioUltimaProgramada(sinProgramadas, AHORA)).toBeNull()
    expect(inicioUltimaProgramada(conProgramada, AHORA)).toBe(NOVIEMBRE)
    expect(inicioProgramable(new Date(NOVIEMBRE), conProgramada, AHORA)).toBe(
      false
    )
    expect(inicioProgramable(new Date(DICIEMBRE), conProgramada, AHORA)).toBe(
      true
    )
  })

  it("sugiere el primer inicio que la celda admite", () => {
    expect(inicioSugerido(sinProgramadas, AHORA)).toBe("manana")
    // Con una programada el 12 de octubre, «mañana» y «próximo lunes» no sirven.
    const programadaElLunes = [
      tarifa(REEL, F1, 100_000, ENERO, "2026-10-12T05:00:00Z"),
      tarifa(REEL, F1, 120_000, "2026-10-12T05:00:00Z"),
    ]
    expect(inicioSugerido(programadaElLunes, AHORA)).toBe("mes")
    // Programada el 1.º de noviembre: ningún preset queda después.
    expect(inicioSugerido(conProgramada, AHORA)).toBe("fecha")
  })
})
