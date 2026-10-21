/**
 * Arma el libro de Excel y el informe PDF de un reporte a partir de su
 * contenido (módulo puro: las imágenes de los gráficos llegan ya capturadas).
 * Ambos documentos llevan la portada o el encabezado de marca de
 * `@/lib/export`, los filtros aplicados y el sello de generación de Bogotá.
 */
import type { HojaExcel, LibroExcel } from "@/lib/export/excel"
import type { ImagenPng } from "@/lib/export/logo"
import type { DocumentoPdf, SeccionPdf } from "@/lib/export/pdf"
import { formatearNumero } from "@/lib/format"

import type { ReporteCatalogo } from "../catalogo"
import type { EspecGrafico } from "../graficos"
import { DENSIDAD_CAPTURA } from "./tamanos"
import {
  detalleIndicador,
  textoAnteriorIndicador,
  textoCifraIndicador,
  textoValorIndicador,
  textoVariacionIndicador,
} from "../indicadores"
import type { ContenidoReporte, ContextoDatos } from "../tipos"
import { sinMovimiento, textoSinMovimiento } from "../vista"

/** Filas máximas de la tabla del PDF: el detalle completo va en el Excel. */
export const MAXIMO_FILAS_PDF = 300

export interface EncabezadoDocumento {
  reporte: Pick<
    ReporteCatalogo,
    "titulo" | "proposito" | "orientacionPdf" | "filtros"
  >
  contexto: ContextoDatos
  generadoPor: string
  fecha: Date
}

function hojaIndicadores(
  contenido: ContenidoReporte,
  contexto: ContextoDatos
): HojaExcel {
  return {
    nombre: "Indicadores",
    titulo: "Indicadores del reporte",
    descripcion: contexto.comparacion
      ? `Variación ${contexto.comparacion}.`
      : undefined,
    columnas: [
      { titulo: "Indicador" },
      { titulo: "Valor" },
      { titulo: "Anterior" },
      { titulo: "Variación" },
      { titulo: "Muestra (n)", formato: "numero" },
      { titulo: "Qué mide", ancho: 70 },
    ],
    filas: contenido.vista.indicadores.map((ind) => [
      ind.titulo,
      textoValorIndicador(ind),
      textoAnteriorIndicador(ind),
      textoVariacionIndicador(ind),
      // Solo las tasas informan su muestra (igual que la tabla en pantalla):
      // junto al GMV, un «n» sería el número de negocios, no una muestra.
      ind.nMinimo !== null ? ind.n : null,
      ind.definicion?.definicion ?? null,
    ]),
  }
}

function hojaDefiniciones(contenido: ContenidoReporte): HojaExcel {
  return {
    nombre: "Cómo leer",
    titulo: "Cómo leer este reporte",
    columnas: [
      { titulo: "Término", ancho: 32 },
      { titulo: "Explicación", ancho: 110 },
    ],
    filas: contenido.notas.map((nota) => [nota.termino, nota.explicacion]),
  }
}

export function construirLibro(
  contenido: ContenidoReporte,
  encabezado: EncabezadoDocumento
): LibroExcel {
  const { tabla } = contenido
  return {
    titulo: encabezado.reporte.titulo,
    subtitulo: encabezado.reporte.proposito,
    filtros: encabezado.contexto.filtros,
    generadoPor: encabezado.generadoPor,
    fecha: encabezado.fecha,
    hojas: [
      hojaIndicadores(contenido, encabezado.contexto),
      {
        nombre: "Detalle",
        titulo: tabla.titulo,
        descripcion: tabla.descripcion,
        columnas: tabla.columnas,
        filas: tabla.filas,
      },
      ...contenido.hojas,
      hojaDefiniciones(contenido),
    ],
  }
}

/**
 * Imagen ya capturada de una fila de gráficos de la vista: un gráfico o, en
 * los informes horizontales, dos de media fila lado a lado (en ese orden).
 */
export interface ImagenGrafico {
  ids: readonly string[]
  imagen: ImagenPng
}

type Orientacion = ReporteCatalogo["orientacionPdf"]

/** Fracción máxima del alto útil de la página que puede ocupar una imagen. */
const ALTO_MAXIMO = 0.7
/** El mapa (con su leyenda al lado) es casi cuadrado: no ocupa todo el ancho. */
const ANCHO_MAPA = 0.55
/** Ancho útil de la página A4 en puntos (márgenes de `@/lib/export/pdf`). */
const ANCHO_UTIL: Readonly<Record<Orientacion, number>> = {
  vertical: 515,
  horizontal: 762,
}
/**
 * Puntos del documento por píxel CSS del gráfico. Todos los gráficos se
 * imprimen a la misma escala (salvo que no quepan a lo ancho): así su texto
 * mide lo mismo en todo el informe y uno angosto, como la dona, no se amplía
 * hasta llenar la página. Con ella caben dos filas de gráficos por página.
 */
export const ESCALA_GRAFICO = 0.54

/** Fracción del ancho útil que ocupa una imagen a la escala del documento. */
export function anchoRelativoImagen(
  anchoPx: number,
  orientacion: Orientacion,
  esMapa = false
): number {
  const anchoCss = anchoPx / DENSIDAD_CAPTURA
  const aEscala = (anchoCss * ESCALA_GRAFICO) / ANCHO_UTIL[orientacion]
  return Math.min(1, aEscala, esMapa ? ANCHO_MAPA : 1)
}

function seccionImagen(
  graficos: readonly EspecGrafico[],
  imagen: ImagenPng,
  orientacion: Orientacion
): SeccionPdf {
  const esMapa = graficos.length === 1 && graficos[0].tipo === "mapa"
  const pies = graficos.flatMap((grafico) => (grafico.pie ? [grafico.pie] : []))
  return {
    tipo: "imagen",
    imagen,
    pie: pies.length > 0 ? pies.join(" · ") : undefined,
    anchoRelativo: anchoRelativoImagen(imagen.ancho, orientacion, esMapa),
    altoRelativo: ALTO_MAXIMO,
  }
}

function seccionGraficoVacio(grafico: EspecGrafico): SeccionPdf[] {
  if (!grafico.vacio) return []
  return [
    {
      tipo: "texto",
      titulo: grafico.titulo,
      parrafos: [
        [grafico.vacio.titulo, grafico.vacio.descripcion]
          .filter(Boolean)
          .join(". "),
      ],
    },
  ]
}

/**
 * Los gráficos en el orden de la vista: cada imagen va donde está su primer
 * gráfico; uno sin datos deja una línea que lo explica; uno que no se pudo
 * dibujar se omite (la descarga lo avisa).
 */
function seccionesGraficos(
  contenido: ContenidoReporte,
  imagenes: readonly ImagenGrafico[],
  orientacion: Orientacion
): SeccionPdf[] {
  const { graficos } = contenido.vista
  const porId = new Map(graficos.map((grafico) => [grafico.id, grafico]))
  const porPrimero = new Map(imagenes.map((fila) => [fila.ids[0], fila]))
  const dibujados = new Set(imagenes.flatMap((fila) => fila.ids))
  return graficos.flatMap((grafico): SeccionPdf[] => {
    const fila = porPrimero.get(grafico.id)
    if (fila) {
      const deLaFila = fila.ids.flatMap((id) => porId.get(id) ?? [])
      return [seccionImagen(deLaFila, fila.imagen, orientacion)]
    }
    return dibujados.has(grafico.id) ? [] : seccionGraficoVacio(grafico)
  })
}

function seccionTabla(contenido: ContenidoReporte): SeccionPdf {
  const { tabla } = contenido
  const filas = tabla.filasPdf.slice(0, MAXIMO_FILAS_PDF)
  const recortada = tabla.filasPdf.length > filas.length
  return {
    tipo: "tabla",
    titulo: tabla.titulo,
    columnas: tabla.columnasPdf,
    filas,
    nota:
      tabla.filasPdf.length === 0
        ? "Sin filas para los filtros elegidos."
        : recortada
          ? `Se muestran ${formatearNumero(filas.length)} de ${formatearNumero(tabla.filasPdf.length)} filas; el Excel trae el detalle completo y todas las columnas.`
          : undefined,
  }
}

/** Las definiciones como tabla de dos columnas: el término se encuentra de un vistazo. */
function seccionNotas(contenido: ContenidoReporte): SeccionPdf[] {
  if (contenido.notas.length === 0) return []
  return [
    {
      tipo: "tabla",
      titulo: "Cómo leer este reporte",
      columnas: [{ titulo: "Término" }, { titulo: "Qué significa" }],
      filas: contenido.notas.map((nota) => [nota.termino, nota.explicacion]),
    },
  ]
}

export function construirDocumentoPdf(
  contenido: ContenidoReporte,
  encabezado: EncabezadoDocumento,
  imagenes: readonly ImagenGrafico[]
): DocumentoPdf {
  const { vista } = contenido
  const { comparacion } = encabezado.contexto
  const conComparativo = comparacion !== null
  const vacio = sinMovimiento(vista)
  const secciones: SeccionPdf[] = []

  if (vista.indicadores.length > 0) {
    secciones.push({
      tipo: "indicadores",
      titulo: conComparativo ? `Indicadores · ${comparacion}` : "Indicadores",
      // La cifra va sola: lo que la explica (comparativo, muestra) va debajo.
      elementos: vista.indicadores.map((ind) => ({
        etiqueta: ind.titulo,
        valor: textoCifraIndicador(ind),
        detalle: detalleIndicador(ind, conComparativo),
      })),
    })
  }
  if (vacio) {
    // Un solo aviso, como en pantalla, en lugar de uno por gráfico vacío.
    const texto = textoSinMovimiento(encabezado.reporte)
    secciones.push({
      tipo: "texto",
      titulo: texto.titulo,
      parrafos: [texto.descripcion],
    })
  }
  if (vista.hallazgos.length > 0 && !vacio) {
    secciones.push({
      tipo: "texto",
      titulo: "Hallazgos del periodo",
      // Guion y no viñeta: la fuente del PDF solo dibuja Latin-1.
      parrafos: vista.hallazgos.map((h) => `- ${h.titulo} ${h.detalle}`),
    })
  }
  if (vista.avisos.length > 0) {
    secciones.push({
      tipo: "texto",
      titulo: "Ten en cuenta",
      parrafos: vista.avisos,
    })
  }
  if (!vacio) {
    secciones.push(
      ...seccionesGraficos(
        contenido,
        imagenes,
        encabezado.reporte.orientacionPdf
      )
    )
  }
  secciones.push(seccionTabla(contenido), ...seccionNotas(contenido))

  return {
    titulo: encabezado.reporte.titulo,
    subtitulo: encabezado.reporte.proposito,
    filtros: encabezado.contexto.filtros,
    orientacion: encabezado.reporte.orientacionPdf,
    generadoPor: encabezado.generadoPor,
    fecha: encabezado.fecha,
    secciones,
  }
}
