/**
 * Archivos de muestra para los documentos y capturas de las cuentas E2E
 * (módulo puro): una imagen PNG y un PDF de una página, válidos y livianos,
 * generados en memoria. Así el visor del equipo AMO abre algo real sin que el
 * repositorio guarde binarios ni datos de personas.
 */
import { crc32, deflateSync } from "node:zlib"

export type ColorRgb = readonly [rojo: number, verde: number, azul: number]

const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const BYTES_POR_PIXEL = 3

/** Bloque PNG: largo, tipo, datos y CRC-32 de tipo + datos. */
function bloquePng(tipo: string, datos: Buffer): Buffer {
  const largo = Buffer.alloc(4)
  largo.writeUInt32BE(datos.length)
  const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos])
  const control = Buffer.alloc(4)
  control.writeUInt32BE(crc32(cuerpo))
  return Buffer.concat([largo, cuerpo, control])
}

function filaDeColor(ancho: number, [rojo, verde, azul]: ColorRgb): Buffer {
  // Cada fila empieza con el filtro 0 (sin filtro).
  const fila = Buffer.alloc(1 + ancho * BYTES_POR_PIXEL)
  for (let x = 0; x < ancho; x += 1) {
    fila.set([rojo, verde, azul], 1 + x * BYTES_POR_PIXEL)
  }
  return fila
}

/**
 * PNG RGB de `ancho` × `alto` con una franja superior (`franja`, el 20 % del
 * alto) sobre un `fondo`: se reconoce a simple vista como una muestra.
 */
export function pngDeMuestra(
  ancho: number,
  alto: number,
  fondo: ColorRgb,
  franja: ColorRgb
): Buffer {
  if (!Number.isInteger(ancho) || !Number.isInteger(alto) || ancho < 1 || alto < 1) {
    throw new RangeError("El PNG necesita un ancho y un alto enteros positivos.")
  }
  const cabecera = Buffer.alloc(13)
  cabecera.writeUInt32BE(ancho, 0)
  cabecera.writeUInt32BE(alto, 4)
  cabecera[8] = 8 // bits por canal
  cabecera[9] = 2 // color verdadero (RGB)
  // Compresión, filtro y entrelazado: 0 (los únicos que define el estándar).
  const filaFranja = filaDeColor(ancho, franja)
  const filaFondo = filaDeColor(ancho, fondo)
  const altoFranja = Math.ceil(alto * 0.2)
  const pixeles = Buffer.concat(
    Array.from({ length: alto }, (_, y) =>
      y < altoFranja ? filaFranja : filaFondo
    )
  )
  return Buffer.concat([
    FIRMA_PNG,
    bloquePng("IHDR", cabecera),
    bloquePng("IDAT", deflateSync(pixeles)),
    bloquePng("IEND", Buffer.alloc(0)),
  ])
}

const LATIN1_MAXIMO = 0xff
const ASCII_IMPRIMIBLE_MAXIMO = 0x7e

/**
 * Texto para un literal `( … )` de PDF con codificación WinAnsi: escapa la
 * barra y los paréntesis, y escribe tildes y eñes como octal (`\351` = é).
 * Lo que no cabe en Latin-1 se reemplaza por «?».
 */
export function escaparTextoPdf(texto: string): string {
  return [...texto]
    .map((caracter) => {
      const codigo = caracter.codePointAt(0) ?? 0
      if (caracter === "\\" || caracter === "(" || caracter === ")") {
        return `\\${caracter}`
      }
      if (codigo >= 0x20 && codigo <= ASCII_IMPRIMIBLE_MAXIMO) return caracter
      if (codigo > ASCII_IMPRIMIBLE_MAXIMO && codigo <= LATIN1_MAXIMO) {
        return `\\${codigo.toString(8).padStart(3, "0")}`
      }
      return "?"
    })
    .join("")
}

const MARGEN = 72
const ALTO_CARTA = 792
const ANCHO_CARTA = 612
const INTERLINEA = 24

/**
 * PDF 1.4 de una página carta con `lineas` de texto en Helvetica. Todo el
 * archivo es ASCII (los acentos van escapados), así que cada carácter es un
 * byte y la tabla de referencias cruzadas apunta exacto a cada objeto.
 */
export function pdfDeMuestra(lineas: readonly string[]): Buffer {
  const texto = [
    "BT",
    "/F1 16 Tf",
    `${INTERLINEA} TL`,
    `${MARGEN} ${ALTO_CARTA - MARGEN} Td`,
    ...lineas.map((linea) => `(${escaparTextoPdf(linea)}) '`),
    "ET",
  ].join("\n")
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ANCHO_CARTA} ${ALTO_CARTA}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${texto.length} >>\nstream\n${texto}\nendstream`,
  ]

  let archivo = "%PDF-1.4\n"
  const posiciones: number[] = []
  objetos.forEach((cuerpo, indice) => {
    posiciones.push(archivo.length)
    archivo += `${indice + 1} 0 obj\n${cuerpo}\nendobj\n`
  })
  const inicioReferencias = archivo.length
  archivo += [
    "xref",
    `0 ${objetos.length + 1}`,
    "0000000000 65535 f ",
    ...posiciones.map(
      (posicion) => `${String(posicion).padStart(10, "0")} 00000 n `
    ),
    "trailer",
    `<< /Size ${objetos.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(inicioReferencias),
    "%%EOF",
    "",
  ].join("\n")
  return Buffer.from(archivo, "latin1")
}
