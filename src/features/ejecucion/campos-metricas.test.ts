import { describe, expect, it } from "vitest"

import {
  CAMPOS_METRICAS,
  camposMetricas,
  etiquetaCampo,
  filaDeValores,
  VALORES_VACIOS,
  valoresDeFila,
} from "./campos-metricas"
import type { CampoMetrica, Plataforma } from "./tipos"

function claves(plataforma: Plataforma, formato: string | null = null) {
  return camposMetricas(plataforma, formato).map((campo) => campo.clave)
}

function obligatorios(plataforma: Plataforma, formato: string | null = null) {
  return camposMetricas(plataforma, formato)
    .filter((campo) => campo.obligatorio)
    .map((campo) => campo.clave)
}

describe("campos de EP §9 por plataforma (MED-014)", () => {
  it("Instagram: alcance, impresiones, reproducciones del reel, interacciones, visitas y clics", () => {
    expect(claves("INSTAGRAM", "REEL")).toEqual([
      "alcance",
      "impresiones",
      "reproducciones",
      "meGusta",
      "comentarios",
      "guardados",
      "compartidos",
      "visitasPerfil",
      "clicsEnlace",
    ])
    // Una foto del feed no tiene reproducciones.
    expect(claves("INSTAGRAM", "POST_FEED")).not.toContain("reproducciones")
  })

  it("Facebook: reacciones y reproducciones de video", () => {
    expect(claves("FACEBOOK", "VIDEO")).toEqual([
      "alcance",
      "impresiones",
      "meGusta",
      "comentarios",
      "compartidos",
      "clicsEnlace",
      "reproducciones",
    ])
    expect(etiquetaCampo("FACEBOOK", "meGusta")).toBe("Reacciones")
    expect(obligatorios("FACEBOOK", "VIDEO")).toContain("reproducciones")
    expect(obligatorios("FACEBOOK", "POST_FEED")).not.toContain(
      "reproducciones"
    )
  })

  it("TikTok: reproducciones, espectadores, tiempo promedio y reproducción completa", () => {
    expect(claves("TIKTOK", "VIDEO")).toEqual([
      "reproducciones",
      "espectadoresUnicos",
      "meGusta",
      "comentarios",
      "compartidos",
      "tiempoPromedioS",
      "porcentajeCompleto",
    ])
    expect(obligatorios("TIKTOK", "VIDEO")).toEqual(claves("TIKTOK", "VIDEO"))
  })

  it("pide siempre lo que exigen los CHECK de cada plataforma", () => {
    const exigidos: Record<Plataforma, CampoMetrica[]> = {
      INSTAGRAM: ["alcance", "impresiones"],
      FACEBOOK: ["alcance", "impresiones"],
      TIKTOK: ["reproducciones", "espectadoresUnicos"],
    }
    for (const plataforma of Object.keys(exigidos) as Plataforma[]) {
      for (const formato of [null, "POST_FEED", "HISTORIA", "REEL", "VIDEO"]) {
        expect(obligatorios(plataforma, formato)).toEqual(
          expect.arrayContaining(exigidos[plataforma])
        )
      }
    }
    // TikTok no reporta alcance ni impresiones; Instagram y Facebook, espectadores.
    expect(claves("TIKTOK")).not.toContain("alcance")
    expect(claves("TIKTOK")).not.toContain("impresiones")
    expect(claves("INSTAGRAM")).not.toContain("espectadoresUnicos")
    expect(claves("FACEBOOK")).not.toContain("espectadoresUnicos")
  })

  it("en una historia, me gusta, comentarios y guardados son opcionales", () => {
    const historia = obligatorios("INSTAGRAM", "HISTORIA")
    expect(historia).not.toContain("meGusta")
    expect(historia).not.toContain("guardados")
    expect(historia).toContain("compartidos")
  })

  it("sin formato conocido, las reproducciones de Instagram son opcionales", () => {
    const reproducciones = camposMetricas("INSTAGRAM").find(
      (campo) => campo.clave === "reproducciones"
    )
    expect(reproducciones?.obligatorio).toBe(false)
  })

  it("marca las que suman a las interacciones", () => {
    const interaccion = CAMPOS_METRICAS.INSTAGRAM.filter(
      (campo) => campo.interaccion
    ).map((campo) => campo.clave)
    expect(interaccion).toEqual([
      "meGusta",
      "comentarios",
      "guardados",
      "compartidos",
    ])
  })
})

describe("conversión con las columnas de metricas", () => {
  it("lee las cifras de la fila (los numeric llegan como texto)", () => {
    expect(
      valoresDeFila({
        alcance: 10,
        tiempo_promedio_visualizacion_s: "12.50",
        porcentaje_reproduccion_completa: null,
      })
    ).toMatchObject({
      alcance: 10,
      tiempoPromedioS: 12.5,
      porcentajeCompleto: null,
    })
  })

  it("deja en null lo que la plataforma o el formato no reportan", () => {
    const fila = filaDeValores(
      "TIKTOK",
      {
        ...VALORES_VACIOS,
        alcance: 5,
        reproducciones: 100,
        espectadoresUnicos: 80,
        guardados: 3,
      },
      "VIDEO"
    )
    expect(fila).toMatchObject({
      alcance: null,
      impresiones: null,
      guardados: null,
      reproducciones: 100,
      espectadores_unicos: 80,
    })
    expect(
      filaDeValores(
        "INSTAGRAM",
        { ...VALORES_VACIOS, reproducciones: 9 },
        "POST_FEED"
      ).reproducciones
    ).toBeNull()
  })
})
