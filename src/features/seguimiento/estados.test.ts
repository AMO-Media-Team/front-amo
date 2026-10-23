import { describe, expect, it } from "vitest"

import { ESTADOS_ASIGNACION } from "@/features/operacion/estados"

import {
  contarPorGrupo,
  ESTADOS_DE_GRUPO,
  ESTADOS_PARA_ANUNCIANTE,
  esperaPublicacion,
  estaCumplida,
  GRUPOS_SEGUIMIENTO,
  grupoDe,
  quedoSinCompletar,
  VALIDACION_PARA_ANUNCIANTE,
} from "./estados"
import type { EstadoAsignacion } from "./tipos"

const TODOS = Object.keys(ESTADOS_ASIGNACION) as EstadoAsignacion[]

describe("estados del seguimiento", () => {
  it("cuenta los 12 estados al anunciante, con texto y tono", () => {
    expect(Object.keys(ESTADOS_PARA_ANUNCIANTE).sort()).toEqual(
      [...TODOS].sort()
    )
    for (const estado of TODOS) {
      const { etiqueta, descripcion } = ESTADOS_PARA_ANUNCIANTE[estado]
      expect(etiqueta.length).toBeGreaterThan(2)
      expect(descripcion).toMatch(/\.$/)
    }
  })

  it("liquidar y pagar no se cuentan al anunciante: todo es «Cumplida»", () => {
    for (const estado of ["VERIFICADA", "LIQUIDADA", "PAGADA"] as const) {
      expect(ESTADOS_PARA_ANUNCIANTE[estado].etiqueta).toBe("Cumplida")
    }
    const textos = Object.values(ESTADOS_PARA_ANUNCIANTE)
      .map((e) => `${e.etiqueta} ${e.descripcion}`)
      .join(" ")
    expect(textos).not.toMatch(/liquid|pag[oó]|recibe/i)
  })

  it("cada estado pertenece a un solo grupo", () => {
    const vistos = GRUPOS_SEGUIMIENTO.flatMap((g) => ESTADOS_DE_GRUPO[g])
    expect([...vistos].sort()).toEqual([...TODOS].sort())
    expect(new Set(vistos).size).toBe(vistos.length)
    expect(grupoDe("ACEPTADA")).toBe("por_publicar")
    expect(grupoDe("METRICAS_CARGADAS")).toBe("publicadas")
    expect(grupoDe("PAGADA")).toBe("cumplidas")
    expect(grupoDe("EN_DISPUTA")).toBe("en_disputa")
    expect(grupoDe("VENCIDA_SIN_PUBLICAR")).toBe("sin_completar")
  })

  it("cuenta por grupo, también los vacíos", () => {
    expect(
      contarPorGrupo([
        { estado: "ACEPTADA" },
        { estado: "CONTENIDO_ENTREGADO" },
        { estado: "VERIFICADA" },
        { estado: "RECHAZADA" },
      ])
    ).toEqual({
      por_publicar: 2,
      publicadas: 0,
      cumplidas: 1,
      en_disputa: 0,
      sin_completar: 1,
    })
  })

  it("distingue lo que espera publicación, lo cumplido y lo caído", () => {
    expect(esperaPublicacion("CONTENIDO_ENTREGADO")).toBe(true)
    expect(esperaPublicacion("PUBLICADA")).toBe(false)
    expect(estaCumplida("LIQUIDADA")).toBe(true)
    expect(estaCumplida("METRICAS_CARGADAS")).toBe(false)
    expect(quedoSinCompletar("CANCELADA")).toBe(true)
    expect(quedoSinCompletar("EN_DISPUTA")).toBe(false)
  })

  it("la validación de una publicación se dice en voz del anunciante", () => {
    expect(VALIDACION_PARA_ANUNCIANTE.PENDIENTE.etiqueta).toBe("En revisión")
    expect(VALIDACION_PARA_ANUNCIANTE.APROBADA.etiqueta).toBe("Validada")
    expect(VALIDACION_PARA_ANUNCIANTE.RECHAZADA.etiqueta).toBe("En corrección")
  })
})
