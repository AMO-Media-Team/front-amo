import { describe, expect, it } from "vitest"

import {
  asignacionDePrueba,
  metricaDePrueba,
  pagoDePrueba,
  publicacionDePrueba,
} from "./fixtures"
import {
  admiteMetricas,
  cortesObligatorios,
  desglosePago,
  lineaTiempoMedio,
  progresoMedio,
  puedeDesistir,
  resumenPublicaciones,
  situacionCorte,
  VALIDACIONES_PARA_MEDIO,
} from "./presentacion"

const ANTES_DEL_LIMITE = new Date("2026-10-23T12:00:00.000Z")
const DESPUES_DEL_LIMITE = new Date("2026-10-24T05:00:00.000Z")

describe("puedeDesistir", () => {
  it("solo aceptada, sin descargar y antes de la fecha límite de aceptación", () => {
    expect(puedeDesistir(asignacionDePrueba(), ANTES_DEL_LIMITE)).toBe(true)
    expect(puedeDesistir(asignacionDePrueba(), DESPUES_DEL_LIMITE)).toBe(false)
    expect(
      puedeDesistir(
        asignacionDePrueba({
          contenidoDescargadoAt: "2026-10-22T10:00:00.000Z",
        }),
        ANTES_DEL_LIMITE
      )
    ).toBe(false)
    expect(
      puedeDesistir(
        asignacionDePrueba({ estado: "CONTENIDO_ENTREGADO" }),
        ANTES_DEL_LIMITE
      )
    ).toBe(false)
  })
})

describe("desglosePago", () => {
  it("con la comisión visible: tarifa, multiplicadores, valor, comisión y lo que recibe", () => {
    const { comisionVisible, lineas } = desglosePago(
      pagoDePrueba({ multiplicadorExclusividad: 1.1 })
    )
    expect(comisionVisible).toBe(true)
    expect(lineas.map((linea) => linea.clave)).toEqual([
      "tarifa",
      "calidad",
      "geografico",
      "exclusividad",
      "bruto",
      "comision",
      "medio",
    ])
    const comision = lineas.find((linea) => linea.clave === "comision")
    expect(comision?.etiqueta).toBe("Comisión AMO (20%)")
    expect(comision?.valor).toMatch(/^− \$\s?126\.000$/)
    expect(lineas.at(-1)).toMatchObject({
      etiqueta: "Recibes",
      destacada: true,
    })
  })

  it("con varias publicaciones, la línea «× N» hace cuadrar la tarifa con el valor bruto", () => {
    // calcular_precio: bruto = tarifa × multiplicadores × publicaciones.
    const { lineas } = desglosePago(
      pagoDePrueba({
        tarifaBase: 100_000,
        multiplicadorCalidad: 1,
        multiplicadorGeografico: 1,
        montoBruto: 300_000,
        porcentajeComision: 0.2,
        montoComision: 60_000,
        montoMedio: 240_000,
      }),
      3
    )
    expect(lineas.map((linea) => linea.clave)).toEqual([
      "tarifa",
      "calidad",
      "geografico",
      "publicaciones",
      "bruto",
      "comision",
      "medio",
    ])
    expect(lineas.find((l) => l.clave === "tarifa")?.ayuda).toMatch(
      /^Por publicación/
    )
    expect(lineas.find((l) => l.clave === "publicaciones")).toMatchObject({
      etiqueta: "Publicaciones",
      valor: "× 3",
      ayuda: "La oferta pide 3 publicaciones.",
    })
    const bruto = lineas.find((l) => l.clave === "bruto")
    expect(bruto?.etiqueta).toBe("Valor bruto")
    expect(bruto?.valor).toMatch(/^\$\s?300\.000$/)
  })

  it("con una sola publicación no repite «× 1» y el bruto no se llama «de la publicación»", () => {
    const { lineas } = desglosePago(pagoDePrueba(), 1)
    expect(lineas.some((l) => l.clave === "publicaciones")).toBe(false)
    expect(lineas.find((l) => l.clave === "bruto")?.etiqueta).toBe(
      "Valor bruto"
    )
  })

  it("sin la comisión visible: solo el multiplicador de calidad y lo que recibe", () => {
    const { comisionVisible, lineas } = desglosePago(
      pagoDePrueba({
        tarifaBase: null,
        multiplicadorGeografico: null,
        montoBruto: null,
        porcentajeComision: null,
        montoComision: null,
      })
    )
    expect(comisionVisible).toBe(false)
    expect(lineas.map((linea) => linea.clave)).toEqual(["calidad", "medio"])
    expect(lineas[0].valor).toBe("1,4 ×")
  })

  it("liquidada: retenciones y neto, que pasa a ser lo destacado", () => {
    const { lineas } = desglosePago(
      pagoDePrueba({ montoRetenciones: 20_160, montoNeto: 483_840 })
    )
    expect(lineas.slice(-3).map((linea) => linea.clave)).toEqual([
      "medio",
      "retenciones",
      "neto",
    ])
    expect(lineas.find((l) => l.clave === "medio")?.destacada).toBe(false)
    expect(lineas.at(-1)?.destacada).toBe(true)
  })
})

describe("cortes de una publicación", () => {
  const publicada = asignacionDePrueba({ estado: "PUBLICADA" })
  const publicacion = publicacionDePrueba()

  it("los obligatorios van en orden y sin el personalizado", () => {
    expect(cortesObligatorios(["D7", "PERSONALIZADO", "H24", "D7"])).toEqual([
      "H24",
      "D7",
    ])
  })

  it("se habilita al cumplirse el corte y vence con el plazo de carga", () => {
    const entrada = {
      estado: publicada.estado,
      corte: "H24" as const,
      publicacion,
      metricas: [],
      plazoCargaHoras: 48,
    }
    expect(
      situacionCorte(entrada, new Date("2026-10-27T14:59:00.000Z"))
    ).toEqual({
      tipo: "por_habilitar",
      desde: "2026-10-27T15:00:00.000Z",
      vence: "2026-10-29T15:00:00.000Z",
    })
    expect(
      situacionCorte(entrada, new Date("2026-10-28T00:00:00.000Z"))
    ).toEqual({
      tipo: "por_cargar",
      vence: "2026-10-29T15:00:00.000Z",
      atrasada: false,
    })
    expect(
      situacionCorte(entrada, new Date("2026-10-30T00:00:00.000Z"))
    ).toMatchObject({ tipo: "por_cargar", atrasada: true })
  })

  it("cargada: editable mientras no esté aprobada y la asignación la admita", () => {
    const metrica = metricaDePrueba({ estado: "RECHAZADA" })
    const ahora = new Date("2026-10-28T00:00:00.000Z")
    expect(
      situacionCorte(
        {
          estado: "PUBLICADA",
          corte: "H24",
          publicacion,
          metricas: [metrica],
        },
        ahora
      )
    ).toEqual({ tipo: "cargada", metrica, editable: true })
    expect(
      situacionCorte(
        {
          estado: "VERIFICADA",
          corte: "H24",
          publicacion,
          metricas: [metrica],
        },
        ahora
      )
    ).toMatchObject({ tipo: "cargada", editable: false })
    expect(
      situacionCorte(
        {
          estado: "PUBLICADA",
          corte: "H24",
          publicacion,
          metricas: [metricaDePrueba({ estado: "APROBADA" })],
        },
        ahora
      )
    ).toMatchObject({ editable: false })
  })

  it("sin publicación, con la evidencia rechazada o cerrada", () => {
    const ahora = new Date("2026-10-28T00:00:00.000Z")
    expect(
      situacionCorte(
        {
          estado: "CONTENIDO_ENTREGADO",
          corte: "H72",
          publicacion: null,
          metricas: [],
        },
        ahora
      )
    ).toEqual({ tipo: "sin_publicacion" })
    expect(
      situacionCorte(
        {
          estado: "CONTENIDO_ENTREGADO",
          corte: "H72",
          publicacion: publicacionDePrueba({ estado: "RECHAZADA" }),
          metricas: [],
        },
        ahora
      )
    ).toEqual({ tipo: "evidencia_por_corregir" })
    expect(
      situacionCorte(
        {
          estado: "VENCIDA_SIN_PUBLICAR",
          corte: "H72",
          publicacion: null,
          metricas: [],
        },
        ahora
      )
    ).toEqual({ tipo: "cerrada" })
    expect(admiteMetricas("PUBLICADA", publicacion)).toBe(true)
    expect(admiteMetricas("VERIFICADA", publicacion)).toBe(false)
    expect(admiteMetricas("PUBLICADA", null)).toBe(false)
  })

  it("resume cuántas publicaciones tienen evidencia", () => {
    expect(resumenPublicaciones(1, [])).toBe("Sin evidencia todavía")
    expect(resumenPublicaciones(1, [{ numero: 1 }])).toBe("Evidencia cargada")
    expect(resumenPublicaciones(3, [{ numero: 1 }, { numero: 2 }])).toBe(
      "2 de 3 publicaciones con evidencia"
    )
  })

  it("las validaciones hablan al medio", () => {
    expect(VALIDACIONES_PARA_MEDIO.RECHAZADA.etiqueta).toBe("Por corregir")
    expect(VALIDACIONES_PARA_MEDIO.PENDIENTE.etiqueta).toBe("En revisión")
  })
})

describe("progresoMedio", () => {
  it("nombra el desenlace en voz del medio", () => {
    const progreso = progresoMedio(
      asignacionDePrueba({
        estado: "RECHAZADA",
        rechazadaAt: "2026-10-21T15:00:00.000Z",
      })
    )
    expect(progreso.desenlace).toMatchObject({
      estado: "RECHAZADA",
      etiqueta: "Desististe",
      at: "2026-10-21T15:00:00.000Z",
    })
    expect(progreso.pasos[0].situacion).toBe("hecho")
    expect(progresoMedio(asignacionDePrueba()).desenlace).toBeNull()
  })
})

describe("lineaTiempoMedio", () => {
  it("cuenta lo que hizo el medio y lo que decidió el equipo AMO, en orden", () => {
    const asignacion = asignacionDePrueba({
      estado: "EVIDENCIA_VALIDADA",
      contenidoDescargadoAt: "2026-10-25T10:00:00.000Z",
      publicadaAt: "2026-10-26T16:00:00.000Z",
      evidenciaValidadaAt: "2026-10-27T09:00:00.000Z",
      creativoDescargadoId: "c2",
    })
    const eventos = lineaTiempoMedio(asignacion, {
      descargas: [
        { at: "2026-10-25T10:00:00.000Z", creativoId: "c1", version: 1 },
        { at: "2026-10-25T20:00:00.000Z", creativoId: "c2", version: 2 },
      ],
      publicaciones: [
        publicacionDePrueba({
          estado: "APROBADA",
          validadaAt: "2026-10-27T09:00:00.000Z",
        }),
      ],
      metricas: [
        metricaDePrueba({
          estado: "RECHAZADA",
          validadaAt: "2026-10-28T09:00:00.000Z",
          observaciones: "La captura no muestra el alcance.",
        }),
      ],
    })
    expect(eventos.map((evento) => evento.titulo)).toEqual([
      "Aceptaste la oferta",
      "Descargaste la versión 1 del contenido",
      "Descargaste la versión 2 del contenido",
      "Cargaste la evidencia",
      "El equipo AMO aprobó tu evidencia",
      "Cargaste las métricas de 24 horas",
      "El equipo AMO pidió corregir las métricas de 24 horas",
    ])
    expect(eventos[0].detalle).toMatch(/^Con @noticias\.pasto, recibes \$/)
    expect(eventos.at(-1)).toMatchObject({
      tono: "peligro",
      detalle: "La captura no muestra el alcance.",
    })
  })

  it("una desistida muestra el motivo y nombra la publicación si hay varias", () => {
    const desistida = lineaTiempoMedio(
      asignacionDePrueba({
        estado: "RECHAZADA",
        rechazadaAt: "2026-10-21T15:00:00.000Z",
        motivo: "Ya no tengo espacio para publicar.",
      }),
      { descargas: [], publicaciones: [], metricas: [] }
    )
    expect(desistida.at(-1)).toMatchObject({
      titulo: "Desististe de la campaña",
      detalle: "Ya no tengo espacio para publicar.",
    })

    const varias = lineaTiempoMedio(
      asignacionDePrueba({
        estado: "CONTENIDO_ENTREGADO",
        publicaciones: 2,
        contenidoDescargadoAt: "2026-10-25T10:00:00.000Z",
      }),
      {
        descargas: [],
        publicaciones: [
          publicacionDePrueba({
            numero: 2,
            estado: "RECHAZADA",
            validadaAt: "2026-10-27T09:00:00.000Z",
            observaciones: "Falta la etiqueta de publicidad.",
          }),
        ],
        metricas: [],
      }
    )
    expect(varias.map((evento) => evento.titulo)).toEqual([
      "Aceptaste la oferta",
      "Descargaste el contenido",
      "Cargaste la evidencia (publicación 2)",
      "El equipo AMO pidió corregir la evidencia (publicación 2)",
    ])
  })
})
