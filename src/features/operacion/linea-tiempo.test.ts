import { describe, expect, it } from "vitest"

import {
  calcularProgreso,
  construirLineaTiempo,
  type MarcasAsignacion,
} from "./linea-tiempo"

function marcas(parcial: Partial<MarcasAsignacion>): MarcasAsignacion {
  return {
    estado: "ACEPTADA",
    estadoPrevioDisputa: null,
    creadaAt: "2026-09-01T15:00:00Z",
    aceptadaAt: "2026-09-01T15:00:00Z",
    contenidoDescargadoAt: null,
    publicadaAt: null,
    evidenciaValidadaAt: null,
    metricasCargadasAt: null,
    verificadaAt: null,
    liquidadaAt: null,
    pagadaAt: null,
    rechazadaAt: null,
    vencidaAt: null,
    enDisputaAt: null,
    canceladaAt: null,
    ...parcial,
  }
}

describe("construirLineaTiempo", () => {
  it("ordena los instantes de la fila del primero al último", () => {
    const eventos = construirLineaTiempo({
      marcas: marcas({
        estado: "PUBLICADA",
        contenidoDescargadoAt: "2026-09-02T15:00:00Z",
        publicadaAt: "2026-09-03T15:00:00Z",
      }),
    })
    expect(eventos.map((evento) => evento.estado)).toEqual([
      "ACEPTADA",
      "CONTENIDO_ENTREGADO",
      "PUBLICADA",
    ])
    expect(eventos.every((evento) => evento.fuente === "registro")).toBe(true)
  })

  it("prefiere la bitácora (con actor y motivo) cuando describe el mismo paso", () => {
    const eventos = construirLineaTiempo({
      marcas: marcas({
        estado: "CONTENIDO_ENTREGADO",
        contenidoDescargadoAt: "2026-09-02T15:00:00Z",
      }),
      transiciones: [
        {
          id: 7,
          at: "2026-09-02T15:01:00Z",
          desde: "ACEPTADA",
          hacia: "CONTENIDO_ENTREGADO",
          actor: "me***@amo.test",
          actorRol: "MEDIO",
          motivo: null,
        },
      ],
    })
    const descargas = eventos.filter(
      (evento) => evento.estado === "CONTENIDO_ENTREGADO"
    )
    expect(descargas).toHaveLength(1)
    expect(descargas[0]).toMatchObject({
      fuente: "bitacora",
      actor: "me***@amo.test · MEDIO",
    })
  })

  it("nombra los retrocesos y los marca como peligro", () => {
    const [evento] = construirLineaTiempo({
      marcas: marcas({ aceptadaAt: null }),
      transiciones: [
        {
          id: 1,
          at: "2026-09-04T15:00:00Z",
          desde: "PUBLICADA",
          hacia: "CONTENIDO_ENTREGADO",
          actor: "op***@amo.test",
          actorRol: "OPERACIONES",
          motivo: "La captura no muestra la etiqueta de publicidad.",
        },
      ],
    })
    expect(evento).toMatchObject({
      titulo: "AMO rechazó la evidencia",
      tono: "peligro",
      detalle: "La captura no muestra la etiqueta de publicidad.",
    })
  })

  it("un rechazo desde el marketplace usa la fecha de creación", () => {
    const eventos = construirLineaTiempo({
      marcas: marcas({ estado: "RECHAZADA", aceptadaAt: null }),
    })
    expect(eventos).toEqual([
      expect.objectContaining({
        titulo: "El medio rechazó la oferta en el marketplace",
        at: "2026-09-01T15:00:00Z",
      }),
    ])
  })

  it("incluye evidencias y métricas rechazadas, alertas y disputas", () => {
    const eventos = construirLineaTiempo({
      marcas: marcas({
        estado: "EN_DISPUTA",
        enDisputaAt: "2026-09-10T15:00:00Z",
      }),
      publicaciones: [
        {
          id: "p1",
          numero: 1,
          creadaAt: "2026-09-03T15:00:00Z",
          estado: "RECHAZADA",
          validadaAt: "2026-09-04T15:00:00Z",
          observaciones: "Borrosa",
        },
      ],
      metricas: [
        {
          id: "m1",
          numero: 1,
          corte: "H24",
          creadaAt: "2026-09-05T15:00:00Z",
          estado: "PENDIENTE",
          validadaAt: null,
          observaciones: null,
          conAlerta: true,
        },
      ],
      disputas: [
        {
          id: "d1",
          creadaAt: "2026-09-10T15:00:00Z",
          motivo: "METRICAS",
          parte: "ANUNCIANTE",
          estado: "RESUELTA",
          resueltaAt: "2026-09-12T15:00:00Z",
          resolucion: "Se acepta el alcance reportado.",
        },
      ],
    })
    const titulos = eventos.map((evento) => evento.titulo)
    expect(titulos).toContain("Evidencia rechazada")
    expect(titulos).toContain("Métricas de 24 horas cargadas")
    expect(titulos).toContain("Disputa por métricas")
    expect(titulos.at(-1)).toBe("Disputa resuelta")
    expect(eventos.find((evento) => evento.categoria === "metrica")?.tono).toBe(
      "aviso"
    )
  })

  it("cuenta una sola vez la apertura de una disputa (disputa + cambio de estado)", () => {
    const eventos = construirLineaTiempo({
      marcas: marcas({
        estado: "EN_DISPUTA",
        enDisputaAt: "2026-09-10T15:00:00Z",
      }),
      disputas: [
        {
          id: "d1",
          creadaAt: "2026-09-10T15:00:00Z",
          motivo: "METRICAS",
          parte: "ANUNCIANTE",
          estado: "ABIERTA",
          resueltaAt: null,
          resolucion: null,
        },
      ],
    })
    expect(eventos.map((evento) => evento.titulo)).toEqual([
      "El medio aceptó el cupo",
      "Disputa por métricas",
    ])
    expect(eventos.at(-1)).toMatchObject({
      categoria: "disputa",
      estado: "EN_DISPUTA",
    })
  })

  it("une la disputa con las transiciones de la bitácora y conserva el actor", () => {
    const eventos = construirLineaTiempo({
      marcas: marcas({
        estado: "METRICAS_CARGADAS",
        metricasCargadasAt: "2026-09-08T15:00:00Z",
        enDisputaAt: "2026-09-10T15:00:00Z",
      }),
      transiciones: [
        {
          id: 20,
          at: "2026-09-10T15:00:00Z",
          desde: "METRICAS_CARGADAS",
          hacia: "EN_DISPUTA",
          actor: "an***@marca.test",
          actorRol: "ANUNCIANTE",
          motivo: null,
        },
        {
          id: 21,
          at: "2026-09-12T15:00:00Z",
          desde: "EN_DISPUTA",
          hacia: "METRICAS_CARGADAS",
          actor: "op***@amo.test",
          actorRol: "OPERACIONES",
          motivo: null,
        },
      ],
      disputas: [
        {
          id: "d1",
          creadaAt: "2026-09-10T15:00:01Z",
          motivo: "METRICAS",
          parte: "ANUNCIANTE",
          estado: "DESCARTADA",
          resueltaAt: "2026-09-12T15:00:00Z",
          resolucion: "El alcance coincide con el panel.",
        },
      ],
    })
    const deDisputa = eventos.filter((evento) => evento.categoria === "disputa")
    expect(deDisputa.map((evento) => evento.titulo)).toEqual([
      "Disputa por métricas",
      "Disputa descartada: pasa a «métricas cargadas»",
    ])
    expect(deDisputa[0].actor).toBe("an***@marca.test · ANUNCIANTE")
    expect(deDisputa[1]).toMatchObject({
      actor: "op***@amo.test · OPERACIONES",
      detalle: "El alcance coincide con el panel.",
      fuente: "bitacora",
    })
    // Ninguna transición de la disputa queda repetida como evento de estado.
    expect(
      eventos.filter(
        (evento) =>
          evento.categoria === "estado" && evento.estado === "EN_DISPUTA"
      )
    ).toHaveLength(0)
    expect(eventos.some((evento) => "desde" in evento)).toBe(false)
  })
})

describe("calcularProgreso", () => {
  it("marca lo hecho, el paso actual y lo pendiente", () => {
    const { pasos, desenlace } = calcularProgreso(
      marcas({
        estado: "PUBLICADA",
        contenidoDescargadoAt: "2026-09-02T15:00:00Z",
        publicadaAt: "2026-09-03T15:00:00Z",
      })
    )
    expect(pasos.map((paso) => paso.situacion)).toEqual([
      "hecho",
      "hecho",
      "actual",
      "pendiente",
      "pendiente",
      "pendiente",
      "pendiente",
      "pendiente",
    ])
    expect(pasos[2].at).toBe("2026-09-03T15:00:00Z")
    expect(desenlace).toBeNull()
  })

  it("pagada completa todo el camino", () => {
    const { pasos } = calcularProgreso(marcas({ estado: "PAGADA" }))
    expect(pasos.every((paso) => paso.situacion === "hecho")).toBe(true)
  })

  it("una caída omite lo que faltaba y la muestra como desenlace", () => {
    const { pasos, desenlace } = calcularProgreso(
      marcas({
        estado: "VENCIDA_SIN_PUBLICAR",
        contenidoDescargadoAt: "2026-09-02T15:00:00Z",
        vencidaAt: "2026-09-08T15:00:00Z",
      })
    )
    expect(pasos.slice(0, 2).map((paso) => paso.situacion)).toEqual([
      "hecho",
      "hecho",
    ])
    expect(pasos.slice(2).every((paso) => paso.situacion === "omitido")).toBe(
      true
    )
    expect(desenlace).toMatchObject({
      estado: "VENCIDA_SIN_PUBLICAR",
      at: "2026-09-08T15:00:00Z",
      tono: "peligro",
    })
  })

  it("una disputa conserva el avance previo y queda como desenlace en curso", () => {
    const { pasos, desenlace } = calcularProgreso(
      marcas({
        estado: "EN_DISPUTA",
        estadoPrevioDisputa: "EVIDENCIA_VALIDADA",
        enDisputaAt: "2026-09-09T15:00:00Z",
      })
    )
    expect(pasos[3].situacion).toBe("hecho")
    expect(pasos[4].situacion).toBe("pendiente")
    expect(desenlace?.estado).toBe("EN_DISPUTA")
  })
})
