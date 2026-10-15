import { describe, expect, it } from "vitest"

import { Constants } from "@/types/database.types"

import {
  consumeCupo,
  ESTADOS_ANUNCIANTE,
  ESTADOS_ASIGNACION,
  ESTADOS_CAMPANA,
  ESTADOS_DISPUTA,
  ESTADOS_DOCUMENTO,
  ESTADOS_FACTURA,
  ESTADOS_LIQUIDACION,
  ESTADOS_MEDIO,
  ESTADOS_OFERTA,
  ESTADOS_POR_GRUPO,
  ESTADOS_VALIDACION,
  etiquetaDe,
  etiquetaNivel,
  GRUPOS_ASIGNACION,
  grupoDeEstado,
  PLATAFORMAS,
  TIPOS_MEDIO,
} from "./estados"

const ENUMS = Constants.public.Enums

describe("catálogos de presentación", () => {
  it.each([
    ["medio_estado", ESTADOS_MEDIO],
    ["anunciante_estado", ESTADOS_ANUNCIANTE],
    ["campana_estado", ESTADOS_CAMPANA],
    ["oferta_estado", ESTADOS_OFERTA],
    ["asignacion_estado", ESTADOS_ASIGNACION],
    ["validacion_estado", ESTADOS_VALIDACION],
    ["documento_estado", ESTADOS_DOCUMENTO],
    ["disputa_estado", ESTADOS_DISPUTA],
    ["factura_estado", ESTADOS_FACTURA],
    ["liquidacion_estado", ESTADOS_LIQUIDACION],
    ["plataforma", PLATAFORMAS],
    ["medio_tipo", TIPOS_MEDIO],
  ] as const)("cubre todos los valores de %s", (nombre, catalogo) => {
    expect(Object.keys(catalogo).sort()).toEqual([...ENUMS[nombre]].sort())
  })

  it("etiquetas de enums y niveles", () => {
    expect(etiquetaDe(ESTADOS_ASIGNACION, "EN_DISPUTA")).toBe("En disputa")
    expect(etiquetaDe(PLATAFORMAS, "TIKTOK")).toBe("TikTok")
    expect(etiquetaDe(PLATAFORMAS, "OTRA")).toBe("OTRA")
    expect(etiquetaDe(PLATAFORMAS, null)).toBe("—")
    expect(etiquetaNivel(2)).toBe("Nivel 2")
    expect(etiquetaNivel(0)).toBe("Sin nivel")
  })
})

describe("grupos de asignaciones", () => {
  it("cada estado pertenece a exactamente un grupo", () => {
    const repartidos = GRUPOS_ASIGNACION.flatMap(
      (grupo) => ESTADOS_POR_GRUPO[grupo]
    )
    expect([...repartidos].sort()).toEqual([...ENUMS.asignacion_estado].sort())
    expect(grupoDeEstado("METRICAS_CARGADAS")).toBe("por_revisar")
    expect(grupoDeEstado("PAGADA")).toBe("cumplidas")
  })

  it("consumeCupo replica private.consume_cupo", () => {
    expect(consumeCupo("ACEPTADA", null)).toBe(true)
    expect(consumeCupo("RECHAZADA", null)).toBe(false)
    expect(consumeCupo("EN_DISPUTA", "PUBLICADA")).toBe(true)
    expect(consumeCupo("EN_DISPUTA", "VENCIDA_SIN_PUBLICAR")).toBe(false)
  })
})
