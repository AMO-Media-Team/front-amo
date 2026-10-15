/**
 * Identidad de los documentos exportados (Excel, PDF, PNG): colores de marca,
 * nota de confidencialidad y sello de generación en hora de Bogotá.
 */
import { LILA, NEUTRO } from "@/components/brand/colores"
import { ZONA } from "@/lib/fechas"
import { LOCALE } from "@/lib/format"

/** Colores en HEX sin `#` (formato de ExcelJS y utilidades de jsPDF). */
export const COLOR_DOCUMENTO = {
  primario: LILA[600],
  primarioProfundo: LILA[800],
  tinte: LILA[50],
  tinteSuave: NEUTRO.fondoClaro,
  texto: "#1B1528",
  textoSecundario: "#615A75",
  borde: NEUTRO.bordeClaro,
  blanco: "#FFFFFF",
} as const

export const TEXTO_CONFIDENCIAL =
  "Confidencial · Uso interno de AMO. No distribuir sin autorización."

export const AUTOR_DOCUMENTO = "AMO — Advertising Market Optimization"

const formatoGeneracion = new Intl.DateTimeFormat(LOCALE, {
  timeZone: ZONA,
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

/** "30 de septiembre de 2026 a las 3:05 p. m. (hora de Bogotá)" (el conector varía según el ICU). */
export function selloGeneracion(fecha: Date): string {
  return `${formatoGeneracion.format(fecha)} (hora de Bogotá)`
}

/** Filtro aplicado que se imprime en la portada o el encabezado. */
export interface FiltroDocumento {
  etiqueta: string
  valor: string
}

/** `#RRGGBB` → `FFRRGGBB` (ARGB de ExcelJS). */
export function argb(hex: string): string {
  return `FF${hex.replace("#", "").toUpperCase()}`
}

/** `#RRGGBB` → `[r, g, b]` (jsPDF). */
export function rgb(hex: string): [number, number, number] {
  const limpio = hex.replace("#", "")
  return [0, 2, 4].map((i) => parseInt(limpio.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ]
}
