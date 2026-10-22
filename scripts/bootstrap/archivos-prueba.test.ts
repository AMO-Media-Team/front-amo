// @vitest-environment node
import { crc32, inflateSync } from "node:zlib"

import { describe, expect, it } from "vitest"

import { escaparTextoPdf, pdfDeMuestra, pngDeMuestra } from "./archivos-prueba"

interface BloquePng {
  tipo: string
  datos: Buffer
  crcValido: boolean
}

/** Lee los bloques de un PNG y comprueba el CRC-32 de cada uno. */
function leerBloques(png: Buffer): BloquePng[] {
  const bloques: BloquePng[] = []
  let posicion = 8
  while (posicion < png.length) {
    const largo = png.readUInt32BE(posicion)
    const tipo = png.toString("ascii", posicion + 4, posicion + 8)
    const datos = png.subarray(posicion + 8, posicion + 8 + largo)
    const control = png.readUInt32BE(posicion + 8 + largo)
    bloques.push({
      tipo,
      datos,
      crcValido:
        crc32(png.subarray(posicion + 4, posicion + 8 + largo)) === control,
    })
    posicion += 12 + largo
  }
  return bloques
}

describe("pngDeMuestra", () => {
  const fondo = [237, 231, 254] as const
  const franja = [117, 73, 222] as const
  const png = pngDeMuestra(10, 5, fondo, franja)

  it("es un PNG válido: firma, IHDR, IDAT, IEND y CRC correctos", () => {
    expect([...png.subarray(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])
    const bloques = leerBloques(png)
    expect(bloques.map((bloque) => bloque.tipo)).toEqual([
      "IHDR",
      "IDAT",
      "IEND",
    ])
    expect(bloques.every((bloque) => bloque.crcValido)).toBe(true)
  })

  it("declara las dimensiones y el formato RGB de 8 bits", () => {
    const [cabecera] = leerBloques(png)
    expect(cabecera.datos.readUInt32BE(0)).toBe(10)
    expect(cabecera.datos.readUInt32BE(4)).toBe(5)
    expect(cabecera.datos[8]).toBe(8)
    expect(cabecera.datos[9]).toBe(2)
  })

  it("pinta la franja en el 20 % superior y el fondo debajo", () => {
    const pixeles = inflateSync(leerBloques(png)[1].datos)
    const anchoFila = 1 + 10 * 3
    expect(pixeles.length).toBe(5 * anchoFila)
    // Fila 0: filtro 0 y color de la franja; fila 4: color de fondo.
    expect(pixeles[0]).toBe(0)
    expect([...pixeles.subarray(1, 4)]).toEqual([...franja])
    expect([...pixeles.subarray(4 * anchoFila + 1, 4 * anchoFila + 4)]).toEqual(
      [...fondo]
    )
  })

  it("rechaza dimensiones que no son enteros positivos", () => {
    expect(() => pngDeMuestra(0, 5, fondo, franja)).toThrow(RangeError)
    expect(() => pngDeMuestra(10, 2.5, fondo, franja)).toThrow(RangeError)
  })
})

describe("escaparTextoPdf", () => {
  it("escapa barra y paréntesis", () => {
    expect(escaparTextoPdf("a (b) \\ c")).toBe("a \\(b\\) \\\\ c")
  })

  it("escribe tildes y eñes en octal WinAnsi y reemplaza lo que no cabe", () => {
    expect(escaparTextoPdf("Bogotá")).toBe("Bogot\\341")
    expect(escaparTextoPdf("Ñ«»")).toBe("\\321\\253\\273")
    expect(escaparTextoPdf("AMO · ✓")).toBe("AMO \\267 ?")
  })
})

describe("pdfDeMuestra", () => {
  const pdf = pdfDeMuestra(["Certificación bancaria", "Prueba (E2E)"])
  const texto = pdf.toString("latin1")

  it("empieza como PDF 1.4 y termina en %%EOF", () => {
    expect(texto.startsWith("%PDF-1.4\n")).toBe(true)
    expect(texto.trimEnd().endsWith("%%EOF")).toBe(true)
  })

  it("es solo ASCII (los acentos van escapados)", () => {
    expect([...pdf].every((byte) => byte < 0x80)).toBe(true)
    expect(texto).toContain("(Certificaci\\363n bancaria) '")
    expect(texto).toContain("(Prueba \\(E2E\\)) '")
  })

  it("la tabla de referencias apunta exacto a cada objeto", () => {
    const inicio = Number(/startxref\n(\d+)\n/.exec(texto)?.[1])
    expect(texto.slice(inicio, inicio + 4)).toBe("xref")
    const entradas = [...texto.matchAll(/^(\d{10}) 00000 n $/gm)].map(
      (coincidencia) => Number(coincidencia[1])
    )
    expect(entradas).toHaveLength(5)
    entradas.forEach((posicion, indice) => {
      expect(texto.slice(posicion).startsWith(`${indice + 1} 0 obj\n`)).toBe(
        true
      )
    })
  })

  it("el largo del flujo coincide con su contenido", () => {
    const [, largo, contenido] =
      /<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/.exec(texto) ?? []
    expect(Number(largo)).toBe(contenido.length)
  })
})
