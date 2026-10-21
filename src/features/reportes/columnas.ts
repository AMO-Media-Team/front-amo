/**
 * Columnas de las tablas de detalle de los reportes, declaradas una sola vez
 * (módulo puro) para la tabla en pantalla, el orden y la búsqueda en el
 * servidor, el Excel y el PDF. Así lo que se ve y lo que se exporta coinciden.
 */
import type { PapelTarjeta } from "@/components/data-table/columnas"
import type { ColumnaExcel, FormatoCelda, ValorCelda } from "@/lib/export/excel"
import type { ColumnaPdf } from "@/lib/export/pdf"
import {
  formatearCOP,
  formatearFecha,
  formatearFechaHora,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"

export type TipoColumna =
  | "texto"
  | "entero"
  | "decimal"
  | "cop"
  /** Fracción: 0,125 → 12,5 %. */
  | "porcentaje"
  /** ISO de un día o instante. */
  | "fecha"
  | "fechaHora"
  | "booleano"

export type ValorColumna = string | number | boolean | null

export interface ColumnaReporte<F> {
  id: string
  titulo: string
  tipo: TipoColumna
  valor: (fila: F) => ValorColumna
  /** Clave de orden cuando difiere de lo que se muestra (meses: "2026-01"). */
  valorOrden?: (fila: F) => ValorColumna
  /** La cabecera ofrece ordenar por esta columna. */
  ordenable?: boolean
  /** Entra en la búsqueda de texto de la tabla. */
  buscable?: boolean
  ocultaPorDefecto?: boolean
  ocultarBajo?: "lg" | "xl"
  tarjeta?: PapelTarjeta
  /** Sale en la tabla del PDF (por defecto, sí). */
  enPdf?: boolean
  /** Suma la columna en la fila de totales del Excel. */
  totalizar?: boolean
  /** Texto largo (definiciones): en pantalla envuelve en varias líneas. */
  envolver?: boolean
  /** Texto con cifras ya formateadas ("$ 1.200", "+4,1 %"): se alinea como número. */
  cifras?: boolean
  /** Encabezado en pantalla cuando el título no cabe (el completo queda como ayuda). */
  tituloCorto?: string
  /** Segunda línea de la celda principal en pantalla (correo, anunciante, ubicación). */
  detalle?: (fila: F) => string | null
}

const FORMATO_EXCEL: Readonly<Record<TipoColumna, FormatoCelda>> = {
  texto: "texto",
  entero: "numero",
  decimal: "decimal",
  cop: "cop",
  porcentaje: "porcentaje",
  fecha: "fecha",
  fechaHora: "fechaHora",
  booleano: "texto",
}

/** Se alinea a la derecha con cifras tabulares (en pantalla y en el PDF). */
export function alineaComoNumero<F>(
  columna: Pick<ColumnaReporte<F>, "tipo" | "cifras">
): boolean {
  return columna.cifras === true || esNumerica(columna.tipo)
}

export function esNumerica(tipo: TipoColumna): boolean {
  return (
    tipo === "entero" ||
    tipo === "decimal" ||
    tipo === "cop" ||
    tipo === "porcentaje"
  )
}

/** Dos decimales siempre: en una columna las comas quedan alineadas (0,80 · 1,27). */
const formatoDecimal = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Texto de la celda tal como se ve en pantalla y en el PDF. */
export function formatearCelda(valor: ValorColumna, tipo: TipoColumna): string {
  if (valor === null || valor === "") return "—"
  switch (tipo) {
    case "texto":
      return String(valor)
    case "booleano":
      return valor ? "Sí" : "No"
    case "fecha":
      return formatearFecha(String(valor))
    case "fechaHora":
      return formatearFechaHora(String(valor))
    default: {
      const numero = typeof valor === "number" ? valor : Number(valor)
      if (!Number.isFinite(numero)) return "—"
      if (tipo === "cop") return formatearCOP(numero)
      if (tipo === "porcentaje") return formatearPorcentaje(numero, 1)
      return tipo === "decimal"
        ? formatoDecimal.format(numero)
        : formatearNumero(numero)
    }
  }
}

/** Valor de la celda de Excel: números reales, fechas reales, sí/no en texto. */
export function valorExcel(valor: ValorColumna, tipo: TipoColumna): ValorCelda {
  if (valor === null || valor === "") return null
  if (tipo === "fecha" || tipo === "fechaHora") {
    const fecha = new Date(String(valor))
    return Number.isNaN(fecha.getTime()) ? String(valor) : fecha
  }
  if (tipo === "booleano") return valor ? "Sí" : "No"
  return valor
}

export function columnasExcel<F>(
  columnas: readonly ColumnaReporte<F>[]
): ColumnaExcel[] {
  return columnas.map((columna) => ({
    titulo: columna.titulo,
    formato: FORMATO_EXCEL[columna.tipo],
    totalizar: columna.totalizar,
  }))
}

export function filasExcel<F>(
  columnas: readonly ColumnaReporte<F>[],
  filas: readonly F[]
): ValorCelda[][] {
  return filas.map((fila) =>
    columnas.map((columna) => valorExcel(columna.valor(fila), columna.tipo))
  )
}

export function columnasPdf<F>(
  columnas: readonly ColumnaReporte<F>[]
): ColumnaPdf[] {
  return columnas
    .filter((columna) => columna.enPdf !== false)
    .map((columna) => ({
      titulo: columna.titulo,
      alinear: alineaComoNumero(columna) ? "derecha" : "izquierda",
    }))
}

/**
 * En el PDF las celdas angostas parten el texto en los espacios: "$ 1.200.000"
 * quedaría con el símbolo en un renglón y la cifra en otro. Sin ese espacio
 * la cifra viaja entera.
 */
export function cifraSinCorte(texto: string): string {
  return texto.replace(/\$\s+/g, "$")
}

export function filasPdf<F>(
  columnas: readonly ColumnaReporte<F>[],
  filas: readonly F[]
): string[][] {
  const visibles = columnas.filter((columna) => columna.enPdf !== false)
  return filas.map((fila) =>
    visibles.map((columna) => {
      const texto = formatearCelda(columna.valor(fila), columna.tipo)
      return alineaComoNumero(columna) ? cifraSinCorte(texto) : texto
    })
  )
}
