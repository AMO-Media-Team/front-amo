import { describe, expect, it } from "vitest"

import { analizarMarkdown, segmentosEnLinea } from "./markdown"

describe("segmentosEnLinea", () => {
  it("separa texto, énfasis y variables", () => {
    expect(
      segmentosEnLinea("Hola **Laura**, tu *oferta* {{ oferta }} cierra hoy")
    ).toEqual([
      { tipo: "texto", texto: "Hola " },
      { tipo: "negrita", texto: "Laura" },
      { tipo: "texto", texto: ", tu " },
      { tipo: "cursiva", texto: "oferta" },
      { tipo: "texto", texto: " " },
      { tipo: "variable", nombre: "oferta" },
      { tipo: "texto", texto: " cierra hoy" },
    ])
  })

  it("deja como texto los asteriscos sin cerrar y el HTML", () => {
    expect(segmentosEnLinea("2 * 3 = 6 <b>no</b>")).toEqual([
      { tipo: "texto", texto: "2 * 3 = 6 <b>no</b>" },
    ])
  })
})

describe("analizarMarkdown", () => {
  it("reconoce títulos, párrafos y listas", () => {
    const bloques = analizarMarkdown(
      [
        "# Términos",
        "",
        "Primera línea",
        "segunda línea",
        "",
        "- uno",
        "- dos",
        "",
        "1. a",
        "2) b",
      ].join("\n")
    )
    expect(bloques.map((b) => b.tipo)).toEqual([
      "titulo",
      "parrafo",
      "lista",
      "lista",
    ])
    expect(bloques[0]).toMatchObject({ tipo: "titulo", nivel: 1 })
    expect(bloques[1]).toMatchObject({ tipo: "parrafo" })
    expect(bloques[1].tipo === "parrafo" && bloques[1].lineas).toHaveLength(2)
    expect(bloques[2]).toMatchObject({ tipo: "lista", ordenada: false })
    expect(bloques[3]).toMatchObject({ tipo: "lista", ordenada: true })
    expect(bloques[3].tipo === "lista" && bloques[3].elementos).toHaveLength(2)
  })

  it("una lista pegada a un párrafo empieza un bloque nuevo y cambia al alternar el tipo", () => {
    const bloques = analizarMarkdown("Requisitos:\n- cédula\n1. RUT\ncierre")
    expect(bloques.map((b) => b.tipo)).toEqual([
      "parrafo",
      "lista",
      "lista",
      "parrafo",
    ])
  })

  it("acepta saltos de línea de Windows y niveles de título hasta 3", () => {
    const bloques = analizarMarkdown("## Dos\r\n### Tres\r\n#### Cuatro")
    expect(bloques).toMatchObject([
      { tipo: "titulo", nivel: 2 },
      { tipo: "titulo", nivel: 3 },
      { tipo: "parrafo" },
    ])
  })

  it("un texto vacío no produce bloques", () => {
    expect(analizarMarkdown("  \n\n ")).toEqual([])
  })
})
