import { describe, expect, it } from "vitest"

import { asignacionDePrueba } from "./fixtures"
import { interpretarAccion } from "./siguiente-accion"
import {
  armarTablero,
  compararTarjetas,
  conteoDelTablero,
  esReclamable,
  tarjetaDe,
  ultimaActividad,
  vencidasPorLeer,
} from "./tablero"
import type { AccionMedio } from "./tipos"

const AHORA = new Date("2026-10-26T12:00:00.000Z")

function id(sufijo: string) {
  return `0199f3a0-0000-7000-8000-00000000${sufijo.padStart(4, "0")}`
}

function accionDe(
  asignacionId: string,
  accion: string,
  venceAt: string,
  extra: { numero?: number; corte?: "H24" | "H72" | "D7" } = {}
): AccionMedio {
  const interpretada = interpretarAccion({
    asignacionId,
    ofertaTitulo: "Oferta",
    accion,
    venceAt,
    numero: extra.numero ?? null,
    corte: extra.corte ?? null,
  })
  if (!interpretada) throw new Error(accion)
  return interpretada
}

describe("tarjetaDe", () => {
  it("lleva lo que pinta la tarjeta, con la marca o el anunciante", () => {
    const tarjeta = tarjetaDe(asignacionDePrueba({ marca: null }), [])
    expect(tarjeta).toMatchObject({
      segmento: "por_publicar",
      marca: "Bebidas del Caribe",
      montoMedio: 504_000,
      paso: { tipo: "accion", accion: { tipo: "DESCARGAR" } },
    })
  })

  it("la última actividad es el instante de transición más reciente", () => {
    expect(
      ultimaActividad(
        asignacionDePrueba({
          contenidoDescargadoAt: "2026-10-22T10:00:00.000Z",
          publicadaAt: "2026-10-25T10:00:00.000Z",
        })
      )
    ).toBe("2026-10-25T10:00:00.000Z")
  })
})

describe("armarTablero", () => {
  it("reparte por segmento y ordena por el plazo más cercano", () => {
    const urgente = asignacionDePrueba({
      id: id("1"),
      estado: "CONTENIDO_ENTREGADO",
    })
    const holgada = asignacionDePrueba({
      id: id("2"),
      estado: "CONTENIDO_ENTREGADO",
    })
    const publicada = asignacionDePrueba({ id: id("3"), estado: "PUBLICADA" })
    const cargada = asignacionDePrueba({
      id: id("9"),
      estado: "METRICAS_CARGADAS",
      metricasCargadasAt: "2026-10-25T00:00:00.000Z",
    })
    const pagada = asignacionDePrueba({
      id: id("4"),
      estado: "PAGADA",
      pagadaAt: "2026-10-01T00:00:00.000Z",
    })
    const vencida = asignacionDePrueba({
      id: id("5"),
      estado: "VENCIDA_SIN_PUBLICAR",
      reclamoHasta: "2026-10-27T00:00:00.000Z",
    })
    const vencidaVieja = asignacionDePrueba({
      id: id("6"),
      estado: "VENCIDA_SIN_PUBLICAR",
      reclamoHasta: "2026-09-01T00:00:00.000Z",
      vencidaAt: "2026-08-29T00:00:00.000Z",
    })
    const tablero = armarTablero(
      [holgada, pagada, vencidaVieja, urgente, publicada, cargada, vencida],
      [
        accionDe(id("1"), "PUBLICAR", "2026-10-27T00:00:00.000Z"),
        accionDe(id("2"), "PUBLICAR", "2026-10-30T00:00:00.000Z"),
        accionDe(id("3"), "CARGAR_METRICA_H24", "2026-10-28T00:00:00.000Z", {
          numero: 1,
          corte: "H24",
        }),
      ],
      AHORA
    )
    expect(tablero.por_publicar.map((t) => t.id)).toEqual([id("1"), id("2")])
    // MED-011: las que deben métricas, aparte de las que esperan verificación.
    expect(tablero.pendiente_metricas.map((t) => t.id)).toEqual([id("3")])
    expect(tablero.en_verificacion.map((t) => t.id)).toEqual([id("9")])
    expect(tablero.terminadas.map((t) => t.id)).toEqual([id("4")])
    // El reclamo abierto va primero; el que ya cerró, después.
    expect(tablero.caidas.map((t) => t.id)).toEqual([id("5"), id("6")])
    expect(conteoDelTablero(tablero)).toEqual({
      por_publicar: 2,
      pendiente_metricas: 1,
      en_verificacion: 1,
      validadas: 0,
      terminadas: 1,
      caidas: 2,
    })
  })

  it("sin plazo, lo más reciente primero", () => {
    const vieja = tarjetaDe(
      asignacionDePrueba({
        id: id("7"),
        estado: "PAGADA",
        pagadaAt: "2026-05-01T00:00:00.000Z",
      }),
      []
    )
    const reciente = tarjetaDe(
      asignacionDePrueba({
        id: id("8"),
        estado: "PAGADA",
        pagadaAt: "2026-10-01T00:00:00.000Z",
      }),
      []
    )
    expect(compararTarjetas(reciente, vieja, AHORA)).toBeLessThan(0)
    expect(compararTarjetas(vieja, reciente, AHORA)).toBeGreaterThan(0)
  })
})

describe("vencidas cuya disputa se lee", () => {
  const enPlazo = asignacionDePrueba({
    id: id("11"),
    estado: "VENCIDA_SIN_PUBLICAR",
    reclamoHasta: "2026-10-27T00:00:00.000Z",
  })
  const reclamadaFueraDePlazo = asignacionDePrueba({
    id: id("12"),
    estado: "VENCIDA_SIN_PUBLICAR",
    reclamoHasta: "2026-10-20T00:00:00.000Z",
    enDisputaAt: "2026-10-19T00:00:00.000Z",
  })
  const nuncaReclamada = asignacionDePrueba({
    id: id("13"),
    estado: "VENCIDA_SIN_PUBLICAR",
    reclamoHasta: "2026-10-20T00:00:00.000Z",
  })
  const enCurso = asignacionDePrueba({
    id: id("14"),
    estado: "PUBLICADA",
    enDisputaAt: "2026-10-19T00:00:00.000Z",
  })

  it("en plazo, o fuera de él si pasó por una disputa: nada más", () => {
    expect(esReclamable(enPlazo, AHORA.getTime())).toBe(true)
    expect(esReclamable(reclamadaFueraDePlazo, AHORA.getTime())).toBe(false)
    expect(
      vencidasPorLeer(
        [reclamadaFueraDePlazo, nuncaReclamada, enCurso, enPlazo],
        AHORA.getTime()
      )
    ).toEqual([id("11"), id("12")])
  })

  it("al recortar, primero las que siguen en plazo", () => {
    expect(
      vencidasPorLeer([reclamadaFueraDePlazo, enPlazo], AHORA.getTime(), 1)
    ).toEqual([id("11")])
  })

  it("ya reclamada y con el plazo terminado, la tarjeta lo dice (no «el plazo terminó»)", () => {
    const tarjeta = tarjetaDe(
      {
        ...reclamadaFueraDePlazo,
        disputa: {
          id: "0199f3a0-0000-7000-8000-0000000000d1",
          estado: "RESUELTA",
          parte: "MEDIO",
          estadoOrigen: "VENCIDA_SIN_PUBLICAR",
          estadoResultante: "VENCIDA_SIN_PUBLICAR",
          creadaAt: "2026-10-19T00:00:00.000Z",
          resueltaAt: "2026-10-21T00:00:00.000Z",
        },
      },
      []
    )
    expect(tarjeta.paso).toEqual({
      tipo: "reclamo",
      hasta: "2026-10-20T00:00:00.000Z",
      asignacionId: id("12"),
      reclamada: true,
    })
  })
})
