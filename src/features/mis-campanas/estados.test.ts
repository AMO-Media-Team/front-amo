import { describe, expect, it } from "vitest"

import { ESTADOS_ASIGNACION } from "@/features/operacion/estados"

import {
  consecuenciaCancelacion,
  contarPorSegmento,
  ESTADOS_PARA_MEDIO,
  ESTADOS_POR_SEGMENTO,
  SEGMENTOS,
  SEGMENTOS_ACTIVOS,
  SEGMENTOS_MIS_CAMPANAS,
  estadoDeTrabajo,
  estaEnCurso,
  segmentoDe,
  segmentoInicial,
} from "./estados"
import type { EstadoAsignacion } from "./tipos"

const TODOS = Object.keys(ESTADOS_ASIGNACION) as EstadoAsignacion[]

describe("ESTADOS_PARA_MEDIO", () => {
  it("cuenta los 12 estados de la asignación en voz del medio", () => {
    expect(Object.keys(ESTADOS_PARA_MEDIO).sort()).toEqual([...TODOS].sort())
    for (const estado of TODOS) {
      const { etiqueta, descripcion } = ESTADOS_PARA_MEDIO[estado]
      expect(etiqueta.length).toBeGreaterThan(0)
      expect(descripcion.endsWith(".")).toBe(true)
    }
  })

  it("habla al medio, no de él", () => {
    for (const estado of TODOS) {
      expect(ESTADOS_PARA_MEDIO[estado].descripcion).not.toMatch(/el medio/i)
    }
    expect(ESTADOS_PARA_MEDIO.RECHAZADA.etiqueta).toBe("Desististe")
    expect(ESTADOS_PARA_MEDIO.ACEPTADA.etiqueta).toBe("Por descargar")
  })
})

describe("segmentos del tablero", () => {
  it("cada estado cae en exactamente un segmento", () => {
    for (const estado of TODOS.filter((e) => e !== "EN_DISPUTA")) {
      const segmentos = SEGMENTOS_MIS_CAMPANAS.filter((segmento) =>
        ESTADOS_POR_SEGMENTO[segmento].includes(estado)
      )
      expect(segmentos).toHaveLength(1)
    }
  })

  it("tienen nombre, ayuda y estado vacío", () => {
    expect(SEGMENTOS_MIS_CAMPANAS.map((s) => SEGMENTOS[s].etiqueta)).toEqual([
      "Por publicar",
      "Pendiente de métricas",
      "En verificación",
      "Validadas",
      "Terminadas",
      "Vencidas o canceladas",
    ])
    for (const segmento of SEGMENTOS_MIS_CAMPANAS) {
      expect(SEGMENTOS[segmento].vacio.titulo.length).toBeGreaterThan(0)
    }
    expect(SEGMENTOS_ACTIVOS).toEqual(["por_publicar", "pendiente_metricas"])
  })

  it("un segmento vacío no da por cumplido lo que puede estar pendiente en otro", () => {
    for (const segmento of SEGMENTOS_MIS_CAMPANAS) {
      const { titulo, descripcion } = SEGMENTOS[segmento].vacio
      expect(`${titulo} ${descripcion}`).not.toMatch(/cumplido|¡Bien!/i)
    }
  })

  it("agrupa por estado y deja la disputa donde estaba antes", () => {
    expect(segmentoDe("ACEPTADA")).toBe("por_publicar")
    expect(segmentoDe("CONTENIDO_ENTREGADO")).toBe("por_publicar")
    // MED-011 c1: con la evidencia cargada, «Pendiente de métricas».
    expect(segmentoDe("PUBLICADA")).toBe("pendiente_metricas")
    expect(segmentoDe("EVIDENCIA_VALIDADA")).toBe("pendiente_metricas")
    expect(segmentoDe("METRICAS_CARGADAS")).toBe("en_verificacion")
    expect(segmentoDe("VERIFICADA")).toBe("validadas")
    expect(segmentoDe("PAGADA")).toBe("terminadas")
    expect(segmentoDe("RECHAZADA")).toBe("caidas")
    expect(segmentoDe("EN_DISPUTA", "VENCIDA_SIN_PUBLICAR")).toBe("caidas")
    expect(segmentoDe("EN_DISPUTA", "METRICAS_CARGADAS")).toBe(
      "en_verificacion"
    )
    expect(segmentoDe("EN_DISPUTA", "VERIFICADA")).toBe("validadas")
    expect(segmentoDe("EN_DISPUTA")).toBe("pendiente_metricas")
  })

  it("cuenta por segmento y abre el primero con algo", () => {
    const conteo = contarPorSegmento([
      { estado: "PAGADA", estadoPrevioDisputa: null },
      { estado: "PUBLICADA", estadoPrevioDisputa: null },
      { estado: "METRICAS_CARGADAS", estadoPrevioDisputa: null },
      { estado: "EN_DISPUTA", estadoPrevioDisputa: "VENCIDA_SIN_PUBLICAR" },
    ])
    expect(conteo).toEqual({
      por_publicar: 0,
      pendiente_metricas: 1,
      en_verificacion: 1,
      validadas: 0,
      terminadas: 1,
      caidas: 1,
    })
    expect(segmentoInicial(conteo)).toBe("pendiente_metricas")
    expect(segmentoInicial(contarPorSegmento([]))).toBe("por_publicar")
  })
})

describe("cancelación, suspensión y disputa", () => {
  it("una cancelación por fraude o incumplimiento no se paga", () => {
    expect(consecuenciaCancelacion("FRAUDE")).toBe(
      "Según los términos que aceptaste, esta publicación no se paga."
    )
    expect(consecuenciaCancelacion("INCUMPLIMIENTO_MEDIO")).toMatch(
      /no se paga y cuenta en tu cumplimiento/
    )
    for (const causa of [
      "ADMINISTRATIVA",
      "ACUERDO",
      null,
      undefined,
    ] as const) {
      expect(consecuenciaCancelacion(causa)).toMatch(
        /Ya no tienes que publicar ni cargar nada más/
      )
    }
  })

  it("en curso: lo que el medio sigue cumpliendo, también en disputa (D73)", () => {
    expect(TODOS.filter(estaEnCurso)).toEqual([
      "ACEPTADA",
      "CONTENIDO_ENTREGADO",
      "PUBLICADA",
      "EVIDENCIA_VALIDADA",
      "METRICAS_CARGADAS",
      "EN_DISPUTA",
    ])
  })

  it("en disputa se trabaja con el estado que tenía al abrirla (D72)", () => {
    expect(
      estadoDeTrabajo({
        estado: "EN_DISPUTA",
        estadoPrevioDisputa: "EVIDENCIA_VALIDADA",
      })
    ).toBe("EVIDENCIA_VALIDADA")
    expect(estadoDeTrabajo({ estado: "EN_DISPUTA" })).toBe("EN_DISPUTA")
    expect(
      estadoDeTrabajo({ estado: "PUBLICADA", estadoPrevioDisputa: "ACEPTADA" })
    ).toBe("PUBLICADA")
  })
})
