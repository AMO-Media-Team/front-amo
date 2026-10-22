import { describe, expect, it } from "vitest"

import {
  esquemaEditarMedio,
  esquemaRegistrarMedio,
  LIMITES_MEDIO,
  normalizarEspacios,
  normalizarParrafos,
  VALORES_REGISTRO,
} from "./schemas"

const CATEGORIA_A = "0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a01"
const CATEGORIA_B = "0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a02"
const MEDIO = "0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a03"

const BASE = {
  nombre: "  Noticias   del Sur ",
  tipo: "PAGINA_NOTICIAS",
  municipioCodigo: "52001",
  descripcionAudiencia: "",
  categoriaIds: [CATEGORIA_A],
}

/** Primer mensaje de error por campo (el que muestra el formulario). */
function errores(entrada: unknown): Record<string, string> {
  const resultado = esquemaRegistrarMedio.safeParse(entrada)
  const primeros: Record<string, string> = {}
  if (resultado.success) return primeros
  for (const issue of resultado.error.issues) {
    primeros[issue.path.map(String).join(".")] ??= issue.message
  }
  return primeros
}

describe("normalizarEspacios / normalizarParrafos", () => {
  it("colapsa espacios y recorta", () => {
    expect(normalizarEspacios("  Radio \t Pasto\n FM ")).toBe("Radio Pasto FM")
  })

  it("conserva los párrafos, quita espacios al final de línea y líneas en blanco de más", () => {
    expect(normalizarParrafos("  Jóvenes  \r\n\r\n\r\n\r\nde Pasto  \n")).toBe(
      "Jóvenes\n\nde Pasto"
    )
  })
})

describe("esquemaRegistrarMedio", () => {
  it("acepta un registro válido y normaliza lo escrito", () => {
    const datos = esquemaRegistrarMedio.parse(BASE)
    expect(datos).toEqual({
      nombre: "Noticias del Sur",
      tipo: "PAGINA_NOTICIAS",
      municipioCodigo: "52001",
      descripcionAudiencia: null,
      categoriaIds: [CATEGORIA_A],
    })
  })

  it("los valores iniciales del formulario piden los obligatorios con mensajes claros", () => {
    expect(errores(VALORES_REGISTRO)).toEqual({
      nombre: "Escribe el nombre del medio.",
      tipo: "Elige el tipo de medio.",
      municipioCodigo: "Elige el municipio.",
    })
  })

  it("exige un nombre de 2 a 120 caracteres (después de normalizar)", () => {
    expect(errores({ ...BASE, nombre: "  A  " }).nombre).toBe(
      "Escribe al menos 2 caracteres."
    )
    expect(errores({ ...BASE, nombre: "AB" }).nombre).toBeUndefined()
    expect(errores({ ...BASE, nombre: "x".repeat(120) }).nombre).toBeUndefined()
    expect(errores({ ...BASE, nombre: "x".repeat(121) }).nombre).toBe(
      "Máximo 120 caracteres."
    )
  })

  it("solo admite tipos del catálogo", () => {
    expect(errores({ ...BASE, tipo: "BLOG" }).tipo).toBe(
      "Elige un tipo de la lista."
    )
    expect(errores({ ...BASE, tipo: "EMISORA" }).tipo).toBeUndefined()
  })

  it("exige un código DIVIPOLA de cinco dígitos", () => {
    expect(errores({ ...BASE, municipioCodigo: "5200" }).municipioCodigo).toBe(
      "Elige un municipio de la lista."
    )
    expect(errores({ ...BASE, municipioCodigo: "52-01" }).municipioCodigo).toBe(
      "Elige un municipio de la lista."
    )
  })

  it("la descripción es opcional y admite hasta 1.000 caracteres", () => {
    const limite = "a".repeat(LIMITES_MEDIO.descripcionMax)
    expect(
      esquemaRegistrarMedio.parse({
        ...BASE,
        descripcionAudiencia: `  ${limite}  `,
      }).descripcionAudiencia
    ).toBe(limite)
    expect(
      errores({ ...BASE, descripcionAudiencia: `${limite}b` })
        .descripcionAudiencia
    ).toBe("Máximo 1.000 caracteres.")
    expect(
      esquemaRegistrarMedio.parse({ ...BASE, descripcionAudiencia: " \n " })
        .descripcionAudiencia
    ).toBeNull()
  })

  it("las categorías son opcionales, únicas y con tope", () => {
    expect(
      esquemaRegistrarMedio.parse({ ...BASE, categoriaIds: [] }).categoriaIds
    ).toEqual([])
    expect(
      errores({
        ...BASE,
        categoriaIds: [CATEGORIA_A, CATEGORIA_B, CATEGORIA_A],
      }).categoriaIds
    ).toBe("Cada categoría se elige una sola vez.")

    const muchas = Array.from(
      { length: LIMITES_MEDIO.categoriasMax + 1 },
      (_, indice) =>
        `0199a1b2-c3d4-7e5f-8a6b-${String(indice).padStart(12, "0")}`
    )
    expect(errores({ ...BASE, categoriaIds: muchas }).categoriaIds).toBe(
      `Elige como máximo ${LIMITES_MEDIO.categoriasMax} categorías.`
    )
    expect(
      errores({ ...BASE, categoriaIds: muchas.slice(1) }).categoriaIds
    ).toBeUndefined()
  })

  it("rechaza identificadores de categoría que no son UUID", () => {
    expect(
      errores({ ...BASE, categoriaIds: ["deportes"] })["categoriaIds.0"]
    ).toBe("Identificador inválido.")
  })
})

describe("esquemaEditarMedio", () => {
  const EDICION = {
    ...BASE,
    medioId: MEDIO,
    actualizadoAt: "2026-10-21T15:04:05.123456+00:00",
  }

  it("lleva el medio y la versión que se abrió (bloqueo optimista)", () => {
    const datos = esquemaEditarMedio.parse(EDICION)
    expect(datos.medioId).toBe(MEDIO)
    expect(datos.actualizadoAt).toBe(EDICION.actualizadoAt)
    expect(datos.nombre).toBe("Noticias del Sur")
  })

  it("sin versión o con un id inválido no se puede guardar", () => {
    const sinVersion = esquemaEditarMedio.safeParse({
      ...EDICION,
      actualizadoAt: "",
    })
    expect(sinVersion.success).toBe(false)
    expect(sinVersion.error?.issues[0]?.message).toBe(
      "Falta la versión del registro."
    )
    expect(
      esquemaEditarMedio.safeParse({ ...EDICION, medioId: "123" }).success
    ).toBe(false)
  })
})
