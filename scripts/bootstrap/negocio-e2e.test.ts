// @vitest-environment node
import { describe, expect, it } from "vitest"

import {
  calendarioOferta,
  disponibleCampana,
  DURACION_CRON_MS,
  esperaPorCron,
  fechasCampana,
  GUARDA_CRON_MS,
  leerRequisitos,
  limitesCampana,
  type OfertaComprometida,
  planCreativo,
  sufijoUnico,
} from "./negocio-e2e"

const HORA = 3_600_000
const DIA = 24 * HORA

/** 10:20 del 22 de octubre de 2026 en Bogotá (UTC−5). */
const AHORA = new Date("2026-10-22T15:20:00Z")

describe("sufijoUnico", () => {
  it("combina la hora y el azar en base 36", () => {
    expect(sufijoUnico(36 ** 3, () => 0)).toBe("1000000")
    expect(sufijoUnico(0, () => 0.999_999)).toBe("0zzz")
    expect(sufijoUnico()).toMatch(/^[0-9a-z]{9,}$/)
  })
})

describe("fechas de campaña", () => {
  it("van de hoy (Bogotá) a hoy + días", () => {
    expect(fechasCampana(AHORA)).toEqual({
      fechaInicio: "2026-10-22",
      fechaFin: "2026-11-21",
    })
    // 22:00 del 22 en Bogotá ya es 23 en UTC: cuenta el día de Bogotá.
    expect(fechasCampana(new Date("2026-10-23T03:00:00Z"), 1)).toEqual({
      fechaInicio: "2026-10-22",
      fechaFin: "2026-10-23",
    })
    expect(() => fechasCampana(AHORA, 0)).toThrow(RangeError)
  })

  it("limitan la ventana desde las 00:00 del inicio hasta las 00:00 del día siguiente al fin", () => {
    expect(
      limitesCampana({ fechaInicio: "2026-10-22", fechaFin: "2026-10-30" })
    ).toEqual({
      inicio: new Date("2026-10-22T05:00:00Z"),
      fin: new Date("2026-10-31T05:00:00Z"),
    })
    expect(() =>
      limitesCampana({ fechaInicio: "ayer", fechaFin: "2026-10-30" })
    ).toThrow()
  })
})

describe("calendarioOferta", () => {
  const campana = limitesCampana(fechasCampana(AHORA))

  it("por omisión: límite dos días después de la anticipación (a la hora) y una semana de ventana", () => {
    const calendario = calendarioOferta({
      ahora: AHORA,
      anticipacionHoras: 24,
      campana,
    })
    // 10:20 + 72 h = 25 oct 10:20 → 11:00 (Bogotá).
    expect(calendario.fechaLimite).toEqual(new Date("2026-10-25T16:00:00Z"))
    expect(calendario.ventanaInicio).toEqual(new Date("2026-10-26T05:00:00Z"))
    expect(calendario.ventanaFin).toEqual(new Date("2026-11-02T05:00:00Z"))
  })

  it("respeta una fecha límite pasada y arma la ventana desde hoy", () => {
    const limite = new Date(AHORA.getTime() - HORA)
    const calendario = calendarioOferta({
      ahora: AHORA,
      anticipacionHoras: 24,
      fechaLimite: limite,
      campana,
    })
    expect(calendario.fechaLimite).toEqual(limite)
    expect(calendario.ventanaInicio).toEqual(new Date("2026-10-23T05:00:00Z"))
    expect(calendario.fechaLimite.getTime()).toBeLessThan(
      calendario.ventanaFin.getTime()
    )
  })

  it("recorta la ventana al final de la campaña y falla si no cabe", () => {
    const corta = limitesCampana(fechasCampana(AHORA, 5))
    const calendario = calendarioOferta({
      ahora: AHORA,
      anticipacionHoras: 24,
      campana: corta,
    })
    expect(calendario.ventanaFin).toEqual(corta.fin)
    expect(() =>
      calendarioOferta({
        ahora: AHORA,
        anticipacionHoras: 24,
        campana: limitesCampana(fechasCampana(AHORA, 2)),
      })
    ).toThrow(/campaña más larga/)
  })

  it("la ventana queda siempre dentro de la campaña y la límite antes de su fin", () => {
    for (const anticipacionHoras of [0, 24, 72]) {
      const c = calendarioOferta({ ahora: AHORA, anticipacionHoras, campana })
      expect(c.ventanaInicio.getTime()).toBeGreaterThanOrEqual(
        campana.inicio.getTime()
      )
      expect(c.ventanaFin.getTime()).toBeLessThanOrEqual(campana.fin.getTime())
      expect(c.fechaLimite.getTime()).toBeLessThanOrEqual(
        c.ventanaFin.getTime()
      )
      expect(c.fechaLimite.getTime() - AHORA.getTime()).toBeGreaterThanOrEqual(
        anticipacionHoras * HORA
      )
    }
  })
})

describe("disponibleCampana", () => {
  const oferta = (
    estado: OfertaComprometida["estado"],
    maximo: number,
    comprometido = 0,
    archivada = false
  ): OfertaComprometida => ({
    estado,
    presupuesto_maximo: maximo,
    presupuesto_comprometido: comprometido,
    deleted_at: archivada ? "2026-10-01T00:00:00Z" : null,
  })

  it("aplica la regla de la BD: máximo de las vivas, comprometido de las cerradas", () => {
    expect(
      disponibleCampana(10_000_000, [
        oferta("BORRADOR", 5_000_000),
        oferta("DEVUELTA", 5_000_000),
        oferta("CANCELADA", 5_000_000),
        oferta("EN_REVISION", 2_000_000),
        oferta("PUBLICADA", 1_000_000, 300_000),
        oferta("CERRADA", 1_000_000, 400_000),
        oferta("VENCIDA", 1_000_000, 0),
        oferta("PUBLICADA", 3_000_000, 0, true),
      ])
    ).toBe(6_600_000)
  })
})

describe("requisitos y creativo", () => {
  it("lee los requisitos con valores por omisión seguros", () => {
    expect(
      leerRequisitos({
        mime: ["video/mp4", 3],
        relaciones_aspecto: ["9:16"],
        duracion_max_s: 90,
      })
    ).toEqual({
      mime: ["video/mp4"],
      relacionesAspecto: ["9:16"],
      duracionMaximaSegundos: 90,
      maxArchivos: 1,
    })
    expect(leerRequisitos(null)).toEqual({
      mime: [],
      relacionesAspecto: [],
      duracionMaximaSegundos: null,
      maxArchivos: 1,
    })
  })

  const imagenesYVideo = ["image/jpeg", "image/png", "video/mp4"]

  it("post de feed: una imagen 1:1 de 1080", () => {
    expect(
      planCreativo(
        "POST_FEED",
        leerRequisitos({
          mime: imagenesYVideo,
          relaciones_aspecto: ["1:1", "4:5"],
        })
      )
    ).toEqual({
      tipo: "IMAGEN",
      archivos: [{ clase: "imagen", ancho: 1080, alto: 1080, segundos: null }],
    })
  })

  it("reel o video: un MP4 vertical u horizontal de 3 s, con lados pares", () => {
    expect(
      planCreativo(
        "REEL",
        leerRequisitos({
          mime: ["video/mp4"],
          relaciones_aspecto: ["9:16"],
          duracion_max_s: 90,
        })
      )
    ).toEqual({
      tipo: "VIDEO",
      archivos: [{ clase: "video", ancho: 360, alto: 640, segundos: 3 }],
    })
    const corto = planCreativo(
      "VIDEO",
      leerRequisitos({
        mime: ["video/mp4"],
        relaciones_aspecto: ["16:9"],
        duracion_max_s: 2,
      })
    )
    expect(corto.archivos[0]).toEqual({
      clase: "video",
      ancho: 640,
      alto: 360,
      segundos: 2,
    })
  })

  it("carrusel: dos imágenes; historia: una imagen 9:16", () => {
    const carrusel = planCreativo(
      "CARRUSEL",
      leerRequisitos({
        mime: imagenesYVideo,
        relaciones_aspecto: ["1:1"],
        max_archivos: 10,
      })
    )
    expect(carrusel.tipo).toBe("CARRUSEL")
    expect(carrusel.archivos).toHaveLength(2)
    expect(
      planCreativo(
        "HISTORIA",
        leerRequisitos({ mime: imagenesYVideo, relaciones_aspecto: ["9:16"] })
      )
    ).toEqual({
      tipo: "IMAGEN",
      archivos: [{ clase: "imagen", ancho: 608, alto: 1080, segundos: null }],
    })
  })

  it("falla con un formato que no admite imágenes ni videos", () => {
    expect(() =>
      planCreativo("RARO", leerRequisitos({ mime: ["text/plain"] }))
    ).toThrow(/no admite/)
  })
})

describe("esperaPorCron", () => {
  /** Instante a `minuto`:`segundo` de una hora cualquiera. */
  const en = (minuto: number, segundo = 0) =>
    Date.UTC(2026, 9, 22, 15, minuto, segundo)

  it("no espera lejos de las corridas (minutos 5, 20, 35 y 50)", () => {
    expect(esperaPorCron(en(10))).toBe(0)
    expect(esperaPorCron(en(19, 0))).toBe(0)
    expect(esperaPorCron(en(0))).toBe(0)
  })

  it("si la siguiente corrida está a menos de la guarda, espera a que pase", () => {
    const ahora = en(19, 30)
    expect(esperaPorCron(ahora)).toBe(en(20) + DURACION_CRON_MS - ahora)
    expect(esperaPorCron(en(4, 59))).toBe(1000 + DURACION_CRON_MS)
    expect(GUARDA_CRON_MS).toBeGreaterThan(30_000)
  })

  it("si la corrida acaba de empezar, espera a que termine", () => {
    expect(esperaPorCron(en(35, 5))).toBe(DURACION_CRON_MS - 5000)
    expect(esperaPorCron(en(50, 20))).toBe(0)
  })

  it("después de esperar ya no hace falta esperar otra vez", () => {
    for (let segundo = 0; segundo < 15 * 60; segundo += 7) {
      const ahora = en(0) + segundo * 1000
      const espera = esperaPorCron(ahora)
      expect(esperaPorCron(ahora + espera)).toBe(0)
      expect(espera).toBeLessThanOrEqual(GUARDA_CRON_MS + DURACION_CRON_MS)
    }
  })
})

describe("limites de días", () => {
  it("el día dura 24 h en Bogotá (sin horario de verano)", () => {
    const { inicio, fin } = limitesCampana({
      fechaInicio: "2026-03-08",
      fechaFin: "2026-03-08",
    })
    expect(fin.getTime() - inicio.getTime()).toBe(DIA)
  })
})
