import { describe, expect, it } from "vitest"

import {
  PATHS_DEPARTAMENTOS,
  VIEWBOX_COLOMBIA,
} from "@/lib/geo/svg-departamentos"

import { mapaColombiaSvg } from "./mapa-svg"

const CODIGOS = Object.keys(PATHS_DEPARTAMENTOS)

const valores = (valor: (indice: number) => number | null) =>
  Object.fromEntries(CODIGOS.map((codigo, i) => [codigo, valor(i)]))

const trazos = (svg: string) =>
  [...svg.matchAll(/<path [^>]*\/>/g)].map((m) => m[0])

describe("mapaColombiaSvg", () => {
  it("dibuja un trazo por departamento en un SVG autónomo", () => {
    const mapa = mapaColombiaSvg({
      valores: valores((i) => i),
      metrica: "medios",
    })
    expect(mapa.svg.startsWith("<svg xmlns=")).toBe(true)
    expect(mapa.svg).toContain(`viewBox="${VIEWBOX_COLOMBIA}"`)
    expect(trazos(mapa.svg)).toHaveLength(CODIGOS.length)
    // Sin CSS ni variables: los colores ya están resueltos.
    expect(mapa.svg).not.toContain("var(")
    expect(mapa.svg).not.toContain("class=")
  })

  it("respeta la proporción del mapa al pedir un ancho", () => {
    const [, , ancho, alto] = VIEWBOX_COLOMBIA.split(/\s+/).map(Number)
    const mapa = mapaColombiaSvg({ valores: {}, metrica: "medios", ancho: 420 })
    expect(mapa.ancho).toBe(420)
    expect(mapa.alto).toBe(Math.round((420 * alto) / ancho))
    expect(mapa.svg).toContain(`width="420" height="${mapa.alto}"`)
  })

  it("raya los departamentos sin dato y colorea los que tienen cero", () => {
    const mapa = mapaColombiaSvg({
      valores: valores((i) => (i === 0 ? null : i === 1 ? 0 : i)),
      metrica: "gmv",
    })
    const rayados = trazos(mapa.svg).filter((t) =>
      t.includes('fill="url(#amo-rayado)"')
    )
    expect(rayados).toHaveLength(1)
    expect(mapa.svg).toContain('<pattern id="amo-rayado"')
  })

  it("un departamento ausente del conjunto también va rayado", () => {
    const mapa = mapaColombiaSvg({
      valores: { [CODIGOS[0]]: 5 },
      metrica: "medios",
    })
    const rayados = trazos(mapa.svg).filter((t) => t.includes("amo-rayado"))
    expect(rayados).toHaveLength(CODIGOS.length - 1)
  })

  it("el departamento destacado va al final y con borde grueso", () => {
    const destacado = CODIGOS[3]
    const mapa = mapaColombiaSvg({
      valores: valores((i) => i),
      metrica: "medios",
      destacado,
    })
    const lista = trazos(mapa.svg)
    const ultimo = lista.at(-1) ?? ""
    expect(ultimo).toContain(`d="${PATHS_DEPARTAMENTOS[destacado]}"`)
    expect(ultimo).toContain('stroke-width="4"')
    expect(lista.filter((t) => t.includes('stroke-width="4"'))).toHaveLength(1)
  })

  it("la leyenda nombra las clases y termina en «Sin datos»", () => {
    const mapa = mapaColombiaSvg({
      valores: valores((i) => i * 3),
      metrica: "medios",
    })
    expect(mapa.leyenda.length).toBeGreaterThanOrEqual(2)
    expect(mapa.leyenda.at(-1)).toMatchObject({
      nombre: "Sin datos",
      rayado: true,
    })
    for (const clase of mapa.leyenda)
      expect(clase.color).toMatch(/^#[0-9a-f]{6}$/i)
    // La última clase con datos es abierta ("12+").
    expect(mapa.leyenda.at(-2)?.nombre.endsWith("+")).toBe(true)
  })

  it("el tema oscuro usa otros trazos", () => {
    const claro = mapaColombiaSvg({
      valores: valores((i) => i),
      metrica: "medios",
    })
    const oscuro = mapaColombiaSvg({
      valores: valores((i) => i),
      metrica: "medios",
      tema: "oscuro",
    })
    expect(claro.svg).not.toBe(oscuro.svg)
  })
})
