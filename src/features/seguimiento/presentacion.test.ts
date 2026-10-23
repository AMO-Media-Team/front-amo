import { describe, expect, it } from "vitest"

import { asignacionPrueba, cortePrueba, publicacionPrueba } from "./fixtures"
import {
  anuncioCambios,
  cambiosEntre,
  hitosAsignacion,
  horaDe,
  ordenarSeguimiento,
  ordenEstable,
  resultadosAsignacion,
  tituloPublicacion,
  ultimaActividad,
  ultimoCorte,
  urlLegible,
} from "./presentacion"

describe("ultimoCorte", () => {
  it("toma el más tardío aprobado: 7 días > 72 horas > 24 horas", () => {
    const h24 = cortePrueba({ corte: "H24" })
    const d7 = cortePrueba({ corte: "D7", fechaCorte: "2026-10-21T13:00:00Z" })
    const h72 = cortePrueba({
      corte: "H72",
      fechaCorte: "2026-10-17T13:00:00Z",
    })
    expect(ultimoCorte([h24, d7, h72])).toBe(d7)
    expect(ultimoCorte([h24, h72])).toBe(h72)
    expect(ultimoCorte([])).toBeNull()
  })
})

describe("resultadosAsignacion", () => {
  it("suma el último corte de cada publicación (los nulos cuentan 0)", () => {
    const resultados = resultadosAsignacion([
      publicacionPrueba({
        cortes: [
          cortePrueba({ corte: "H24", alcance: 100, impresiones: 150 }),
          cortePrueba({
            corte: "H72",
            alcance: 300,
            impresiones: 400,
            interacciones: 20,
            clics: 5,
          }),
        ],
      }),
      publicacionPrueba({
        numero: 2,
        cortes: [
          cortePrueba({
            corte: "H24",
            alcance: 50,
            impresiones: 60,
            interacciones: null,
            reproducciones: 80,
          }),
        ],
      }),
      publicacionPrueba({ numero: 3, cortes: [] }),
    ])
    expect(resultados).toEqual({
      alcance: 350,
      impresiones: 460,
      interacciones: 20,
      reproducciones: 80,
      clics: 5,
      publicacionesConCortes: 2,
    })
  })

  it("sin cortes aprobados no hay resultados", () => {
    expect(resultadosAsignacion([publicacionPrueba()])).toBeNull()
    expect(resultadosAsignacion([])).toBeNull()
  })
})

describe("orden por actividad", () => {
  it("la última actividad incluye publicaciones y cortes", () => {
    const asignacion = asignacionPrueba({
      aceptadaAt: "2026-10-10T15:00:00Z",
      publicadaAt: "2026-10-14T13:23:00Z",
      publicaciones: [
        publicacionPrueba({
          cortes: [cortePrueba({ fechaCorte: "2026-10-18T10:00:00Z" })],
        }),
      ],
    })
    expect(ultimaActividad(asignacion)).toBe("2026-10-18T10:00:00Z")
  })

  it("lo último que pasó va primero; a igual actividad se conserva el orden", () => {
    const vieja = asignacionPrueba({
      aceptadaAt: "2026-10-01T15:00:00Z",
      contenidoDescargadoAt: null,
    })
    const nueva = asignacionPrueba({
      aceptadaAt: "2026-10-05T15:00:00Z",
      contenidoDescargadoAt: null,
      verificadaAt: "2026-10-20T15:00:00Z",
    })
    const empate = asignacionPrueba({
      aceptadaAt: "2026-10-01T15:00:00Z",
      contenidoDescargadoAt: null,
    })
    expect(ordenarSeguimiento([vieja, nueva, empate])).toEqual([
      nueva,
      vieja,
      empate,
    ])
  })
})

describe("ordenEstable", () => {
  it("las que ya estaban no saltan; las nuevas entran arriba por actividad", () => {
    const a = asignacionPrueba({ aceptadaAt: "2026-10-01T15:00:00Z" })
    const b = asignacionPrueba({ aceptadaAt: "2026-10-02T15:00:00Z" })
    const c = asignacionPrueba({ aceptadaAt: "2026-10-03T15:00:00Z" })
    const d = asignacionPrueba({
      aceptadaAt: "2026-10-04T15:00:00Z",
      contenidoDescargadoAt: null,
    })
    const e = asignacionPrueba({
      aceptadaAt: "2026-10-05T15:00:00Z",
      contenidoDescargadoAt: null,
    })
    // `b` cambió (ahora es la más reciente) y `c` desapareció.
    const bVerificada = { ...b, verificadaAt: "2026-10-20T15:00:00Z" }
    const orden = ordenEstable([a.id, b.id, c.id], [d, bVerificada, a, e])
    expect(orden.map((x) => x.id)).toEqual([e.id, d.id, a.id, b.id])
    expect(orden[3]).toBe(bVerificada)
  })
})

describe("hitosAsignacion", () => {
  it("lista lo ocurrido en orden y el plazo pendiente para publicar", () => {
    const hitos = hitosAsignacion(
      asignacionPrueba({
        estado: "CONTENIDO_ENTREGADO",
        aceptadaAt: "2026-10-10T15:00:00Z",
        contenidoDescargadoAt: "2026-10-11T15:00:00Z",
        fechaLimitePublicacion: "2026-10-20T04:59:59Z",
      })
    )
    expect(hitos.map((h) => [h.titulo, h.pendiente])).toEqual([
      ["Aceptó el cupo", false],
      ["Descargó tu contenido", false],
      ["Publicar a más tardar", true],
    ])
  })

  it("una asignación cumplida no tiene pendiente; una vencida lo dice", () => {
    const cumplida = hitosAsignacion(
      asignacionPrueba({
        estado: "VERIFICADA",
        publicadaAt: "2026-10-14T13:00:00Z",
        evidenciaValidadaAt: "2026-10-14T20:00:00Z",
        metricasCargadasAt: "2026-10-21T13:00:00Z",
        verificadaAt: "2026-10-22T13:00:00Z",
      })
    )
    expect(cumplida.at(-1)).toMatchObject({
      titulo: "Cumplida: métricas verificadas",
      tono: "exito",
      pendiente: false,
    })
    const vencida = hitosAsignacion(
      asignacionPrueba({
        estado: "VENCIDA_SIN_PUBLICAR",
        vencidaAt: "2026-10-20T05:00:00Z",
      })
    )
    expect(vencida.at(-1)).toMatchObject({
      titulo: "Venció sin publicar",
      tono: "peligro",
    })
    expect(vencida.some((h) => h.pendiente)).toBe(false)
  })
})

describe("cambios entre consultas", () => {
  it("detecta asignaciones nuevas y con novedades (estado, evidencia o cortes)", () => {
    const publicacion = publicacionPrueba({ estadoValidacion: "PENDIENTE" })
    const a = asignacionPrueba({
      estado: "PUBLICADA",
      publicaciones: [publicacion],
    })
    const b = asignacionPrueba()
    const c = asignacionPrueba()
    const antes = [a, b]
    const despues = [
      {
        ...a,
        publicaciones: [
          { ...publicacion, estadoValidacion: "APROBADA" as const },
        ],
      },
      b,
      c,
    ]
    const cambios = cambiosEntre(antes, despues)
    expect(cambios).toEqual({ nuevas: [c.id], cambiadas: [a.id] })
    expect(anuncioCambios(cambios)).toBe(
      "Seguimiento actualizado: 1 medio nuevo y 1 asignación con novedades."
    )
  })

  it("sin cambios no se anuncia nada", () => {
    const a = asignacionPrueba()
    expect(anuncioCambios(cambiosEntre([a], [a]))).toBe("")
    expect(anuncioCambios({ nuevas: ["1", "2"], cambiadas: [] })).toBe(
      "Seguimiento actualizado: 2 medios nuevos."
    )
  })
})

describe("textos", () => {
  it("la hora de la consulta es la de Bogotá", () => {
    expect(horaDe("2026-10-16T20:45:00Z")).toMatch(/^3:45\sp\.\s?m\.$/)
    expect(horaDe("no es fecha")).toBe("—")
  })

  it("la URL del post se lee sin protocolo ni barra final", () => {
    expect(urlLegible("https://www.instagram.com/p/CxPrueba123/")).toBe(
      "instagram.com/p/CxPrueba123"
    )
  })

  it("solo numera la publicación si hay varias", () => {
    expect(tituloPublicacion({ numero: 2 }, 3)).toBe("Publicación 2")
    expect(tituloPublicacion({ numero: 1 }, 1)).toBe("Publicación")
  })
})
