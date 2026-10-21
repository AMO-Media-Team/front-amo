// @vitest-environment node
import type { jsPDF } from "jspdf"
import { describe, expect, it } from "vitest"

import { TEXTO_CONFIDENCIAL } from "./marca"
import { construirPdf, type DocumentoPdf, textoPdf } from "./pdf"

/** PNG de 1 × 1 px. */
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
const LOGO = { dataUrl: PNG, ancho: 400, alto: 100 }
const FECHA = new Date("2026-09-30T20:05:00Z")

/** Textos dibujados en cada página (operadores `(...) Tj` antes de comprimir). */
function textosPorPagina(doc: jsPDF): string[][] {
  const paginas = (doc.internal as unknown as { pages: (string[] | null)[] })
    .pages
  return paginas
    .slice(1)
    .map((operadores) =>
      (operadores ?? []).flatMap((operador) =>
        [...operador.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) =>
          m[1].replace(/\\(.)/g, "$1")
        )
      )
    )
}

function imagenesPorPagina(doc: jsPDF): number[] {
  const paginas = (doc.internal as unknown as { pages: (string[] | null)[] })
    .pages
  return paginas
    .slice(1)
    .map(
      (operadores) => (operadores ?? []).filter((o) => / Do$/m.test(o)).length
    )
}

const BASE: DocumentoPdf = {
  titulo: "Resumen ejecutivo",
  subtitulo: "Septiembre de 2026",
  filtros: [
    { etiqueta: "Periodo", valor: "1–30 sept 2026" },
    { etiqueta: "Plataforma", valor: "Todas" },
  ],
  generadoPor: "Ana Operaciones",
  fecha: FECHA,
  secciones: [
    {
      tipo: "indicadores",
      titulo: "Indicadores",
      elementos: [
        {
          etiqueta: "GMV verificado",
          valor: "$ 184.320.000",
          detalle: "↑ +22,9 % frente al periodo anterior",
        },
        { etiqueta: "Take rate", valor: "19,8 %", detalle: "−0,4 pp" },
      ],
    },
    {
      tipo: "imagen",
      titulo: "Tendencia del GMV",
      imagen: { dataUrl: PNG, ancho: 1200, alto: 600 },
      pie: "Fuente: AMO",
    },
    {
      tipo: "texto",
      titulo: "Notas",
      parrafos: ["El alcance es acumulado, sin deduplicar."],
    },
  ],
}

describe("construirPdf", () => {
  it("encabezado con logo y título, bloque de filtros y sello de generación", async () => {
    const doc = await construirPdf(BASE, LOGO)
    const [primera] = textosPorPagina(doc)
    expect(primera).toEqual(
      expect.arrayContaining([
        "Resumen ejecutivo",
        "Septiembre de 2026",
        "Periodo: 1-30 sept 2026   ·   Plataforma: Todas",
        "Indicadores",
        "GMV verificado",
        "$ 184.320.000",
        "+22,9 % frente al periodo anterior",
        "-0,4 pp",
        "Tendencia del GMV",
        "Fuente: AMO",
        "El alcance es acumulado, sin deduplicar.",
      ])
    )
    expect(
      primera.some((t) =>
        /^Generado el 30 de septiembre de 2026.*3:05 p\. m\. \(hora de Bogotá\) por Ana Operaciones$/.test(
          t
        )
      )
    ).toBe(true)
    // Logo del encabezado + gráfico.
    expect(imagenesPorPagina(doc)[0]).toBe(2)
  })

  it("cada página lleva «Página X de Y» y la marca de confidencialidad", async () => {
    const filas = Array.from({ length: 120 }, (_, i) => [
      `Medio ${i + 1}`,
      `${i}`,
    ])
    const doc = await construirPdf(
      {
        ...BASE,
        secciones: [
          {
            tipo: "tabla",
            titulo: "Medios",
            columnas: [
              { titulo: "Medio" },
              { titulo: "Asignaciones", alinear: "derecha" },
            ],
            filas,
            nota: "n = número de asignaciones verificadas.",
          },
        ],
      },
      LOGO
    )
    const paginas = textosPorPagina(doc)
    expect(paginas.length).toBeGreaterThan(2)
    paginas.forEach((textos, i) => {
      expect(textos).toContain(`Página ${i + 1} de ${paginas.length}`)
      expect(textos).toContain(textoPdf(TEXTO_CONFIDENCIAL))
      expect(textos).toContain("Resumen ejecutivo")
    })
    expect(imagenesPorPagina(doc).every((n) => n === 1)).toBe(true)
    const todo = paginas.flat()
    expect(todo).toContain("Medio 120")
    expect(todo).toContain("n = número de asignaciones verificadas.")
    // El encabezado de la tabla se repite en cada página.
    expect(
      paginas.filter((textos) => textos.includes("Asignaciones")).length
    ).toBe(paginas.length)
  })

  it("el título de una sección nunca queda solo al final de la página", async () => {
    const filas = Array.from({ length: 26 }, (_, i) => [
      `Fila ${i + 1}`,
      `${i}`,
    ])
    const doc = await construirPdf(
      {
        titulo: "Informe",
        fecha: FECHA,
        secciones: [
          {
            tipo: "tabla",
            columnas: [{ titulo: "A" }, { titulo: "B" }],
            filas,
          },
          {
            tipo: "imagen",
            titulo: "Gráfico final",
            imagen: { dataUrl: PNG, ancho: 1000, alto: 500 },
          },
        ],
      },
      null
    )
    const paginas = textosPorPagina(doc)
    const conTitulo = paginas.findIndex((textos) =>
      textos.includes("Gráfico final")
    )
    expect(conTitulo).toBeGreaterThan(0)
    expect(imagenesPorPagina(doc)[conTitulo]).toBe(1)
  })

  it("una imagen más alta que la página se reduce para caber", async () => {
    const doc = await construirPdf(
      {
        titulo: "Mapa",
        fecha: FECHA,
        secciones: [
          {
            tipo: "imagen",
            imagen: { dataUrl: PNG, ancho: 400, alto: 4000 },
            pie: "© Mapbox © OpenStreetMap",
          },
        ],
      },
      null
    )
    const paginas = textosPorPagina(doc)
    expect(paginas.length).toBeLessThanOrEqual(2)
    expect(paginas.flat()).toContain("© Mapbox © OpenStreetMap")
  })

  it("orientación horizontal y metadatos del documento", async () => {
    const doc = await construirPdf({ ...BASE, orientacion: "horizontal" }, null)
    expect(doc.internal.pageSize.getWidth()).toBeGreaterThan(
      doc.internal.pageSize.getHeight()
    )
    // Sin logo, la única imagen es el gráfico (pasa a la página 2 si no cabe).
    expect(imagenesPorPagina(doc).reduce((a, b) => a + b, 0)).toBe(1)
  })
})

describe("textoPdf", () => {
  it("sustituye lo que Helvetica (Latin-1) no puede dibujar", () => {
    expect(textoPdf("$\u00a012,5\u202fM")).toBe("$ 12,5 M")
    expect(textoPdf("\u22122,1 pp")).toBe("-2,1 pp")
    expect(textoPdf("1\u201330 sept")).toBe("1-30 sept")
    expect(textoPdf("Sin dato: \u2014")).toBe("Sin dato: -")
    expect(textoPdf("n \u2265 20\u2026")).toBe("n >= 20...")
  })

  it("quita las flechas: el signo ya dice la dirección", () => {
    expect(textoPdf("\u2191 +12,5 %")).toBe("+12,5 %")
    expect(textoPdf("\u2192 0,0 %")).toBe("0,0 %")
  })

  it("conserva tildes, eñes y símbolos de Latin-1", () => {
    expect(textoPdf("Bogotá · Nariño © «AMO» 1,15 ×")).toBe(
      "Bogotá · Nariño © «AMO» 1,15 ×"
    )
  })
})
