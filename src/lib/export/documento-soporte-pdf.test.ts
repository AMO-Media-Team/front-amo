// @vitest-environment node
import type { jsPDF } from "jspdf"
import { describe, expect, it } from "vitest"

import {
  construirDocumentoSoportePdf,
  type DatosDocumentoSoportePdf,
  diaEnPalabras,
  esResolucionDePrueba,
  PENDIENTE_CONFIGURAR,
  PENDIENTE_TRANSMISION,
  periodoEnPalabras,
  SIN_REGISTRAR,
  textoResolucion,
  TITULO_DOCUMENTO_SOPORTE,
} from "./documento-soporte-pdf"
import { LOGO_DOCUMENTOS } from "./logo-documentos.generated"

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

/** Todo el texto de una página en una sola cadena (los párrafos se parten en líneas). */
function textoCorrido(textos: readonly string[]): string {
  return textos.join(" ").replace(/\s+/g, " ")
}

const CUDS = "a1b2c3d4e5f6".repeat(8)

const BASE: DatosDocumentoSoportePdf = {
  numero: "DS1234",
  fechaEmision: "2026-10-17",
  periodo: { inicio: "2026-10-01", fin: "2026-10-15" },
  resolucion: {
    numero: "18764000000002",
    fecha: "2025-06-01",
    prefijo: "DS",
    rangoDesde: 1,
    rangoHasta: 90_000,
    vigenteDesde: "2025-06-01",
    vigenteHasta: "2027-06-01",
  },
  vendedor: {
    nombre: "Tatiana Martínez",
    documento: "CC 1.023.456.789",
    direccion: "Cll 34 # 66-34",
    municipio: "Santa Marta, Magdalena",
  },
  adquiriente: {
    nombre: null,
    documento: null,
    direccion: null,
    municipio: "Bogotá, D.C.",
  },
  lineas: [
    {
      publicacion: "Post de feed de Instagram · Amor y Amistad",
      marca: "Fundación Universitaria Horizonte",
      plataformaFormato: "Instagram · Post de feed",
      fecha: "2026-10-06T13:00:42Z",
      valor: 360_000,
    },
  ],
  valorTotal: 360_000,
  retenciones: [
    {
      nombre: "Retención en la fuente · Servicios",
      tarifa: "6 %",
      base: 360_000,
      valor: 21_600,
    },
    {
      nombre: "ReteICA · Santa Marta",
      tarifa: "9,66 por mil",
      base: 360_000,
      valor: 3_478,
    },
  ],
  totalRetenciones: 25_078,
  netoAPagar: 334_922,
  cuds: null,
  generadoAt: new Date("2026-10-17T20:05:00Z"),
}

describe("construirDocumentoSoportePdf", () => {
  it("título, número, fecha, periodo y resolución de numeración", async () => {
    const doc = await construirDocumentoSoportePdf(BASE, LOGO_DOCUMENTOS)
    const [primera] = textosPorPagina(doc)
    const corrido = textoCorrido(primera)
    expect(corrido).toContain(TITULO_DOCUMENTO_SOPORTE)
    expect(primera).toEqual(
      expect.arrayContaining([
        "Número",
        "DS1234",
        "Fecha de emisión",
        "17 de octubre de 2026",
        "Periodo liquidado",
        "Del 1 al 15 de octubre de 2026",
      ])
    )
    expect(corrido).toContain(
      "Resolución DIAN N.º 18764000000002 del 1 de junio de 2025 · Prefijo DS · Rango del 1 al 90.000"
    )
    expect(corrido).toContain(
      "Vigencia del 1 de junio de 2025 al 1 de junio de 2027."
    )
    expect(doc.getNumberOfPages()).toBe(1)
  })

  it("vendedor y adquiriente; lo que falta se dice", async () => {
    const doc = await construirDocumentoSoportePdf(BASE, null)
    const [primera] = textosPorPagina(doc)
    expect(primera).toEqual(
      expect.arrayContaining([
        "Vendedor (no obligado a facturar)",
        "Tatiana Martínez",
        "Documento de identidad",
        "CC 1.023.456.789",
        "Cll 34 # 66-34",
        "Santa Marta, Magdalena",
        "Adquiriente",
        "NIT",
        "Bogotá, D.C.",
      ])
    )
    // Razón social, NIT y dirección de AMO sin configurar.
    expect(primera.filter((t) => t === PENDIENTE_CONFIGURAR)).toHaveLength(3)

    const sinDatos = await construirDocumentoSoportePdf(
      {
        ...BASE,
        vendedor: {
          nombre: "Óscar Zapata",
          documento: null,
          direccion: null,
          municipio: null,
        },
      },
      null
    )
    expect(
      textosPorPagina(sinDatos)[0].filter((t) => t === SIN_REGISTRAR)
    ).toHaveLength(3)
  })

  it("detalle por publicación, retenciones y neto a pagar", async () => {
    const doc = await construirDocumentoSoportePdf(BASE, null)
    const [primera] = textosPorPagina(doc)
    expect(primera).toEqual(
      expect.arrayContaining([
        "Detalle de las publicaciones",
        "Post de feed de Instagram · Amor y Amistad",
        "Fundación Universitaria Horizonte",
        "Instagram · Post de feed",
        "06/10/2026",
        "Retenciones practicadas",
        "Retención en la fuente · Servicios",
        "6 %",
        "ReteICA · Santa Marta",
        "9,66 por mil",
        "$ 21.600",
        "$ 3.478",
        "Valor total",
        "$ 360.000",
        "Total retenciones",
        "-$ 25.078",
        "Neto a pagar",
        "$ 334.922",
      ])
    )
  })

  it("un emoji, «★» o un texto NFD no dejan ilegible la línea (todo queda en WinAnsi)", async () => {
    const doc = await construirDocumentoSoportePdf(
      {
        ...BASE,
        vendedor: {
          ...BASE.vendedor,
          nombre: "Tatiana Martínez ★".normalize("NFD"),
          direccion: "Cll 34 # 66-34 🏠",
        },
        lineas: [
          {
            ...BASE.lineas[0],
            publicacion: "Promo 🔥 Navidad ★ en Pasto",
            marca: "Café • Bar Ñandú".normalize("NFD"),
          },
        ],
      },
      null
    )
    const [primera] = textosPorPagina(doc)
    // jsPDF codifica en UTF-16 (con nulos intercalados) la cadena que trae algo fuera de WinAnsi.
    expect(primera.some((texto) => texto.includes("\u0000"))).toBe(false)
    expect(primera).toEqual(
      expect.arrayContaining([
        "Promo Navidad en Pasto",
        // «•» va como su byte de WinAnsi (0x95).
        "Café \u0095 Bar Ñandú",
        "Tatiana Martínez",
        "Cll 34 # 66-34",
      ])
    )
  })

  it("sin CUDS dice que falta transmitirlo; con CUDS lo imprime completo", async () => {
    const pendiente = await construirDocumentoSoportePdf(BASE, null)
    expect(textosPorPagina(pendiente)[0]).toContain(PENDIENTE_TRANSMISION)

    const transmitido = await construirDocumentoSoportePdf(
      { ...BASE, cuds: CUDS },
      null
    )
    const [primera] = textosPorPagina(transmitido)
    expect(primera).toContain(CUDS)
    expect(primera).not.toContain(PENDIENTE_TRANSMISION)
  })

  it("sin retenciones lo dice y el total va en cero", async () => {
    const doc = await construirDocumentoSoportePdf(
      { ...BASE, retenciones: [], totalRetenciones: 0, netoAPagar: 360_000 },
      null
    )
    const [primera] = textosPorPagina(doc)
    expect(primera).toContain("No se practicaron retenciones en este pago.")
    expect(primera).toContain("$ 0")
  })

  it("una resolución de prueba lleva la marca de agua en cada página", async () => {
    const lineas = Array.from({ length: 45 }, (_, i) => ({
      ...BASE.lineas[0],
      publicacion: `Publicación ${i + 1}`,
    }))
    const doc = await construirDocumentoSoportePdf(
      {
        ...BASE,
        lineas,
        resolucion: {
          ...BASE.resolucion!,
          prefijo: "PDS",
          numero: "PRUEBA-DS",
        },
      },
      LOGO_DOCUMENTOS
    )
    const paginas = textosPorPagina(doc)
    expect(paginas.length).toBeGreaterThan(1)
    paginas.forEach((textos, i) => {
      expect(textos).toEqual(
        expect.arrayContaining([
          "VERSIÓN DE PRUEBA",
          "SIN VALIDEZ FISCAL",
          "Documento soporte DS1234",
          `Página ${i + 1} de ${paginas.length}`,
        ])
      )
    })
    // El aviso en la cabecera del documento (la raya se dibuja como guion).
    expect(paginas[0]).toContain("VERSIÓN DE PRUEBA - SIN VALIDEZ FISCAL")
    // El encabezado de la tabla se repite y el logotipo va en cada página.
    expect(
      paginas.filter((textos) => textos.includes("Plataforma y formato")).length
    ).toBe(paginas.length)
    expect(imagenesPorPagina(doc).every((n) => n === 1)).toBe(true)
    expect(paginas.flat()).toContain("Publicación 45")
  })

  it("una resolución real no lleva marca de agua", async () => {
    const doc = await construirDocumentoSoportePdf(BASE, null)
    const todo = textosPorPagina(doc).flat()
    expect(todo).not.toContain("VERSIÓN DE PRUEBA")
    expect(todo.some((t) => t.includes("SIN VALIDEZ FISCAL"))).toBe(false)
  })

  it("pie con sello de generación en hora de Bogotá y metadatos", async () => {
    const doc = await construirDocumentoSoportePdf(BASE, null)
    const [primera] = textosPorPagina(doc)
    expect(
      primera.some((t) =>
        /^Generado el 17 de octubre de 2026.*3:05 p\. m\. \(hora de Bogotá\) · AMO$/.test(
          t
        )
      )
    ).toBe(true)
    const bytes = new Uint8Array(doc.output("arraybuffer"))
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-")
  })
})

describe("esResolucionDePrueba", () => {
  const real = { prefijo: "DS", numero: "18764000000002" }

  it("prefijo DEMO o PRUEBA, o número que empieza por PRUEBA", () => {
    expect(esResolucionDePrueba({ prefijo: "DEMO", numero: "1876" })).toBe(true)
    expect(esResolucionDePrueba({ prefijo: "prueba", numero: "1" })).toBe(true)
    expect(esResolucionDePrueba({ prefijo: "PDS", numero: "PRUEBA-DS" })).toBe(
      true
    )
    expect(esResolucionDePrueba({ prefijo: "", numero: "prueba 1" })).toBe(true)
  })

  it("una resolución real o ausente no es de prueba", () => {
    expect(esResolucionDePrueba(real)).toBe(false)
    expect(esResolucionDePrueba({ prefijo: "DEM", numero: "1" })).toBe(false)
    expect(esResolucionDePrueba({ prefijo: "DS", numero: "1-PRUEBA" })).toBe(
      false
    )
    expect(esResolucionDePrueba(null)).toBe(false)
  })
})

describe("fechas y textos del documento", () => {
  it("día en palabras sin desfase de zona", () => {
    expect(diaEnPalabras("2026-10-01")).toBe("1 de octubre de 2026")
    expect(diaEnPalabras(null)).toBe("—")
  })

  it("periodo sin repetir mes ni año", () => {
    expect(periodoEnPalabras("2026-10-01", "2026-10-15")).toBe(
      "Del 1 al 15 de octubre de 2026"
    )
    expect(periodoEnPalabras("2026-09-28", "2026-10-04")).toBe(
      "Del 28 de septiembre al 4 de octubre de 2026"
    )
    expect(periodoEnPalabras("2026-12-20", "2027-01-03")).toBe(
      "Del 20 de diciembre de 2026 al 3 de enero de 2027"
    )
    expect(periodoEnPalabras("2026-10-15", "2026-10-15")).toBe(
      "El 15 de octubre de 2026"
    )
    expect(periodoEnPalabras("x", "2026-10-15")).toBe("—")
  })

  it("resolución sin fecha de fin, sin prefijo o ausente", () => {
    expect(
      textoResolucion({
        numero: "18764",
        fecha: "2026-01-02",
        prefijo: "",
        rangoDesde: 1,
        rangoHasta: 5000,
        vigenteDesde: "2026-01-02",
        vigenteHasta: null,
      })
    ).toBe(
      "Autorización de numeración: Resolución DIAN N.º 18764 del 2 de enero de 2026 · Rango del 1 al 5.000 · Vigencia desde el 2 de enero de 2026."
    )
    expect(textoResolucion(null)).toBe(
      "Autorización de numeración: sin resolución registrada."
    )
  })
})
