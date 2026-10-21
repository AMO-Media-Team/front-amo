/**
 * Resumen en lenguaje natural (aria) y tabla alternativa de cada gráfico.
 * Puro: se prueba sin DOM y garantiza que ningún valor quede solo en el trazo.
 */
import { formatearDelta, formatearPorcentaje } from "@/lib/format"

import {
  conversionesEmbudo,
  DIAS_SEMANA,
  type CeldaActividad,
  type ElementoValor,
  type EtapaEmbudo,
  franjaHoraria,
  mayorCaida,
} from "./datos"
import {
  conUnidad,
  formatearValor,
  type FormatoValor,
  type Unidad,
} from "./formatos"
import type { DatosAccesibles, Serie } from "./tipos"

function ultimoValido(
  valores: readonly (number | null)[]
): { indice: number; valor: number } | null {
  for (let i = valores.length - 1; i >= 0; i--) {
    const valor = valores[i]
    if (valor !== null && Number.isFinite(valor)) return { indice: i, valor }
  }
  return null
}

function primeroValido(
  valores: readonly (number | null)[]
): { indice: number; valor: number } | null {
  const indice = valores.findIndex((v) => v !== null && Number.isFinite(v))
  return indice === -1 ? null : { indice, valor: valores[indice] as number }
}

function maximo(
  valores: readonly (number | null)[]
): { indice: number; valor: number } | null {
  return valores.reduce<{ indice: number; valor: number } | null>(
    (mejor, valor, indice) => {
      if (valor === null || !Number.isFinite(valor)) return mejor
      return !mejor || valor > mejor.valor ? { indice, valor } : mejor
    },
    null
  )
}

/** "A, B y C". */
export function enumerar(partes: readonly string[]): string {
  if (partes.length <= 1) return partes[0] ?? ""
  return `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}`
}

function describirSerie(
  serie: Serie,
  etiquetas: readonly string[],
  formato: FormatoValor
): string {
  const inicio = primeroValido(serie.valores)
  const fin = ultimoValido(serie.valores)
  if (!inicio || !fin) return `${serie.nombre}: sin datos`
  const cambio =
    inicio.valor !== 0
      ? (fin.valor - inicio.valor) / Math.abs(inicio.valor)
      : null
  const tramo =
    cambio === null || inicio.indice === fin.indice
      ? ""
      : ` (${formatearDelta(cambio)} desde ${etiquetas[inicio.indice]})`
  const pico = maximo(serie.valores)
  const textoPico =
    pico && pico.indice !== fin.indice
      ? `; máximo ${formatearValor(pico.valor, formato)} en ${etiquetas[pico.indice]}`
      : ""
  return `${serie.nombre}: ${formatearValor(fin.valor, formato)} en ${etiquetas[fin.indice]}${tramo}${textoPico}`
}

export function datosTendencia({
  titulo,
  etiquetas,
  series,
  anterior,
  formato,
  etiquetaEje = "Periodo",
}: {
  titulo: string
  etiquetas: readonly string[]
  series: readonly Serie[]
  anterior?: Serie
  formato: FormatoValor
  etiquetaEje?: string
}): DatosAccesibles {
  const todas = anterior ? [...series, anterior] : series
  const partes = series.map((serie) =>
    describirSerie(serie, etiquetas, formato)
  )
  return {
    resumen: etiquetas.length
      ? `${titulo}. ${partes.join(". ")}.`
      : `${titulo}: sin datos en el periodo.`,
    tabla: {
      columnas: [
        { titulo: etiquetaEje },
        ...todas.map((serie) => ({ titulo: serie.nombre, numerica: true })),
      ],
      filas: etiquetas.map((etiqueta, i) => [
        etiqueta,
        ...todas.map((serie) => formatearValor(serie.valores[i], formato)),
      ]),
    },
  }
}

export interface SerieFormateada extends Serie {
  formato: FormatoValor
}

export function datosCombo({
  titulo,
  etiquetas,
  barras,
  linea,
  etiquetaEje = "Periodo",
}: {
  titulo: string
  etiquetas: readonly string[]
  barras: SerieFormateada
  linea: SerieFormateada
  etiquetaEje?: string
}): DatosAccesibles {
  return {
    resumen: etiquetas.length
      ? `${titulo}. ${describirSerie(barras, etiquetas, barras.formato)}. ${describirSerie(linea, etiquetas, linea.formato)}.`
      : `${titulo}: sin datos en el periodo.`,
    tabla: {
      columnas: [
        { titulo: etiquetaEje },
        { titulo: barras.nombre, numerica: true },
        { titulo: linea.nombre, numerica: true },
      ],
      filas: etiquetas.map((etiqueta, i) => [
        etiqueta,
        formatearValor(barras.valores[i], barras.formato),
        formatearValor(linea.valores[i], linea.formato),
      ]),
    },
  }
}

function participacion(valor: number, total: number): string {
  return total > 0 ? formatearPorcentaje(valor / total, 1) : "—"
}

export function datosRanking({
  titulo,
  elementos,
  formato,
  nombreValor,
  nombreCategoria = "Nombre",
}: {
  titulo: string
  elementos: readonly ElementoValor[]
  formato: FormatoValor
  nombreValor: string
  nombreCategoria?: string
}): DatosAccesibles {
  const total = elementos.reduce((suma, e) => suma + e.valor, 0)
  const primeros = elementos
    .slice(0, 3)
    .map((e) => `${e.nombre} (${formatearValor(e.valor, formato)})`)
  return {
    resumen: elementos.length
      ? `${titulo}. Encabeza ${enumerar(primeros)}.`
      : `${titulo}: sin datos en el periodo.`,
    tabla: {
      columnas: [
        { titulo: nombreCategoria },
        { titulo: nombreValor, numerica: true },
        { titulo: "Participación", numerica: true },
      ],
      filas: elementos.map((e) => [
        e.nombre,
        formatearValor(e.valor, formato),
        participacion(e.valor, total),
      ]),
    },
  }
}

export function datosApiladas({
  titulo,
  categorias,
  series,
  formato,
  nombreCategoria = "Categoría",
}: {
  titulo: string
  categorias: readonly string[]
  series: readonly Serie[]
  formato: FormatoValor
  nombreCategoria?: string
}): DatosAccesibles {
  const totales = categorias.map((_, i) =>
    series.reduce((suma, serie) => suma + (serie.valores[i] ?? 0), 0)
  )
  const pico = maximo(totales)
  const resumen =
    categorias.length && pico
      ? `${titulo}. ${series.length} series (${enumerar(series.map((s) => s.nombre))}). Mayor total: ${categorias[pico.indice]} con ${formatearValor(pico.valor, formato)}.`
      : `${titulo}: sin datos en el periodo.`
  return {
    resumen,
    tabla: {
      columnas: [
        { titulo: nombreCategoria },
        ...series.map((serie) => ({ titulo: serie.nombre, numerica: true })),
        { titulo: "Total", numerica: true },
      ],
      filas: categorias.map((categoria, i) => [
        categoria,
        ...series.map((serie) => formatearValor(serie.valores[i], formato)),
        formatearValor(totales[i], formato),
      ]),
    },
  }
}

export function datosDona({
  titulo,
  segmentos,
  formato,
  nombreCategoria = "Segmento",
}: {
  titulo: string
  segmentos: readonly ElementoValor[]
  formato: FormatoValor
  nombreCategoria?: string
}): DatosAccesibles {
  const total = segmentos.reduce((suma, s) => suma + s.valor, 0)
  const partes = segmentos.map(
    (s) => `${s.nombre} ${participacion(s.valor, total)}`
  )
  return {
    resumen:
      total > 0
        ? `${titulo}. Total ${formatearValor(total, formato)}: ${enumerar(partes)}.`
        : `${titulo}: sin datos en el periodo.`,
    tabla: {
      columnas: [
        { titulo: nombreCategoria },
        { titulo: "Valor", numerica: true },
        { titulo: "Participación", numerica: true },
      ],
      filas: [
        ...segmentos.map((s) => [
          s.nombre,
          formatearValor(s.valor, formato),
          participacion(s.valor, total),
        ]),
        ["Total", formatearValor(total, formato), participacion(total, total)],
      ],
    },
  }
}

export function datosEmbudo({
  titulo,
  etapas,
  unidad,
}: {
  titulo: string
  etapas: readonly EtapaEmbudo[]
  unidad: Unidad
}): DatosAccesibles {
  const conConversion = conversionesEmbudo(etapas)
  const primera = conConversion[0]
  const ultima = conConversion.at(-1)
  const caida = mayorCaida(conConversion)
  const indiceCaida = caida ? conConversion.indexOf(caida) : -1
  const resumen =
    primera && ultima && primera.cantidad > 0
      ? `${titulo}. De ${conUnidad(primera.cantidad, unidad)} en «${primera.nombre}» a ${formatearValor(ultima.cantidad, "numero")} en «${ultima.nombre}» (${formatearPorcentaje(ultima.delInicio, 1)} del inicio).` +
        (caida && indiceCaida > 0
          ? ` La mayor caída es de «${conConversion[indiceCaida - 1].nombre}» a «${caida.nombre}»: pasa el ${formatearPorcentaje(caida.deLaAnterior, 1)}.`
          : "")
      : `${titulo}: sin datos en el periodo.`
  return {
    resumen,
    tabla: {
      columnas: [
        { titulo: "Etapa" },
        { titulo: "Cantidad", numerica: true },
        { titulo: "De la etapa anterior", numerica: true },
        { titulo: "Del inicio", numerica: true },
      ],
      filas: conConversion.map((etapa) => [
        etapa.nombre,
        formatearValor(etapa.cantidad, "numero"),
        formatearPorcentaje(etapa.deLaAnterior, 1),
        formatearPorcentaje(etapa.delInicio, 1),
      ]),
    },
  }
}

export function datosMapaCalor({
  titulo,
  celdas,
  unidad,
}: {
  titulo: string
  celdas: readonly CeldaActividad[]
  unidad: Unidad
}): DatosAccesibles {
  const total = celdas.reduce((suma, c) => suma + c.cantidad, 0)
  const pico = celdas.reduce<CeldaActividad | null>(
    (mejor, celda) =>
      !mejor || celda.cantidad > mejor.cantidad ? celda : mejor,
    null
  )
  const resumen =
    total > 0 && pico
      ? `${titulo}. ${conUnidad(total, unidad)} en total. El pico es el ${DIAS_SEMANA[pico.diaSemana - 1].toLowerCase()} de ${franjaHoraria(pico.hora)}, con ${conUnidad(pico.cantidad, unidad)}.`
      : `${titulo}: sin actividad en el periodo.`
  return {
    resumen,
    tabla: {
      columnas: [
        { titulo: "Hora" },
        ...DIAS_SEMANA.map((dia) => ({ titulo: dia, numerica: true })),
      ],
      filas: Array.from({ length: 24 }, (_, hora) => [
        franjaHoraria(hora),
        ...DIAS_SEMANA.map((_, d) =>
          formatearValor(
            celdas.find((c) => c.diaSemana === d + 1 && c.hora === hora)
              ?.cantidad ?? 0,
            "numero"
          )
        ),
      ]),
    },
  }
}
