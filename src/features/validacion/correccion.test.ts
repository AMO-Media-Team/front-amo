import { describe, expect, it } from "vitest"

import { VALORES_VACIOS } from "@/features/ejecucion/campos-metricas"
import { conReglasMetricas, datosMetricas } from "@/features/ejecucion/schemas"

import {
  cambiosCorreccion,
  reglasCorreccion,
  valoresInicialesCorreccion,
} from "./correccion"
import { esquemaCorreccion } from "./schemas"
import type { MetricaParaCorregir } from "./tipos"

const ID = "0192f3a4-5b6c-7d8e-9f01-0000000000a1"
/** 10:15 de Bogotá del 22 de octubre (UTC−5). */
const FECHA_CORTE = "2026-10-22T15:15:40.123+00:00"
const AHORA = new Date("2026-10-23T15:00:00Z")

const METRICA: MetricaParaCorregir = {
  metricaId: ID,
  asignacionId: ID,
  publicacionId: ID,
  numero: 1,
  corte: "H24",
  plataforma: "INSTAGRAM",
  formatoClave: "POST_FEED",
  fechaCorte: FECHA_CORTE,
  periodo: null,
  fechaPublicacion: "2026-10-21T12:00:00Z",
  valores: {
    ...VALORES_VACIOS,
    alcance: 12500,
    impresiones: 20000,
    meGusta: 300,
    comentarios: 12,
    compartidos: 4,
    guardados: 9,
  },
  otros: [
    {
      id: "0192f3a4-5b6c-7d8e-9f01-0000000000b2",
      corte: "H72",
      estado: "PENDIENTE",
      alcance: 1300,
      impresiones: 2100,
      interacciones: 330,
    },
  ],
  tolerancia: 0.02,
}

function validar(valores: Record<string, unknown>) {
  const reglas = reglasCorreccion(METRICA, AHORA)
  return conReglasMetricas(esquemaCorreccion, reglas).safeParse(valores)
}

describe("valoresInicialesCorreccion", () => {
  it("abre con la fecha de Bogotá y las cifras escritas en es-CO", () => {
    const valores = valoresInicialesCorreccion(METRICA)
    expect(valores).toMatchObject({
      metricaId: ID,
      corte: "H24",
      dia: "2026-10-22",
      hora: "10:15",
      alcance: "12.500",
      impresiones: "20.000",
      reproducciones: "",
      motivo: "",
    })
  })
})

describe("la corrección se valida como la carga del medio (INT-005)", () => {
  it("una corrección incoherente con el corte posterior se rechaza", () => {
    const resultado = validar({
      ...valoresInicialesCorreccion(METRICA),
      motivo: "El medio digitó un cero de más en el alcance.",
    })
    // El corte de 72 h (1.300) quedaría por debajo del de 24 h (12.500).
    expect(resultado.success).toBe(false)
  })

  it("y la coherente pasa, con solo lo que cambió para la BD", () => {
    const escrito = {
      ...valoresInicialesCorreccion(METRICA),
      alcance: "1.250",
      impresiones: "2.000",
      motivo: "El medio digitó un cero de más en el alcance.",
    }
    const resultado = validar(escrito)
    expect(resultado.success).toBe(true)
    if (!resultado.success) return
    const datos = datosMetricas(
      resultado.data,
      reglasCorreccion(METRICA, AHORA)
    )
    expect(datos).not.toBeNull()
    if (!datos) return
    expect(cambiosCorreccion(METRICA, datos, escrito)).toEqual({
      alcance: 1250,
      impresiones: 2000,
    })
  })

  it("la fecha del corte entra solo si cambió el día o la hora", () => {
    const escrito = {
      ...valoresInicialesCorreccion(METRICA),
      hora: "11:00",
      alcance: "1.250",
      impresiones: "2.000",
      motivo: "La captura es de las 11 de la mañana.",
    }
    const resultado = validar(escrito)
    expect(resultado.success).toBe(true)
    if (!resultado.success) return
    const datos = datosMetricas(
      resultado.data,
      reglasCorreccion(METRICA, AHORA)
    )
    if (!datos) throw new Error("Sin datos")
    expect(cambiosCorreccion(METRICA, datos, escrito)).toEqual({
      fecha_corte: "2026-10-22T16:00:00.000Z",
      alcance: 1250,
      impresiones: 2000,
    })
  })

  it("los segundos de la publicación no bloquean una fecha que no se tocó", () => {
    // Corte cargado 24 h y 20 s después de publicar: el formulario muestra la
    // hora sin segundos, que quedaría «antes de cumplirse el corte».
    const ajustada: MetricaParaCorregir = {
      ...METRICA,
      otros: [],
      fechaPublicacion: "2026-10-21T15:15:30.000Z",
      fechaCorte: "2026-10-22T15:15:50.000Z",
    }
    const escrito = {
      ...valoresInicialesCorreccion(ajustada),
      alcance: "12.000",
      motivo: "El medio digitó mal el alcance.",
    }
    const reglas = reglasCorreccion(ajustada, AHORA)
    const resultado = conReglasMetricas(esquemaCorreccion, reglas).safeParse(
      escrito
    )
    expect(resultado.success).toBe(true)
    if (!resultado.success) return
    const datos = datosMetricas(resultado.data, reglas)
    if (!datos) throw new Error("Sin datos")
    expect(cambiosCorreccion(ajustada, datos, escrito)).toEqual({
      alcance: 12000,
    })
  })

  it("sin cambios no hay nada que mandar", () => {
    const sinOtros = { ...METRICA, otros: [] }
    const escrito = {
      ...valoresInicialesCorreccion(sinOtros),
      motivo: "Revisé la captura y no cambia nada.",
    }
    const reglas = reglasCorreccion(sinOtros, AHORA)
    const resultado = conReglasMetricas(esquemaCorreccion, reglas).safeParse(
      escrito
    )
    expect(resultado.success).toBe(true)
    if (!resultado.success) return
    const datos = datosMetricas(resultado.data, reglas)
    if (!datos) throw new Error("Sin datos")
    expect(cambiosCorreccion(sinOtros, datos, escrito)).toEqual({})
  })
})
