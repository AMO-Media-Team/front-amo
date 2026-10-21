/**
 * Disposición y tamaño (px CSS) con que se dibuja cada gráfico para
 * incrustarlo en el PDF: proporciones de documento, no de pantalla. Las
 * listas (rankings y barras horizontales) crecen con sus filas para que cada
 * etiqueta respire. En los informes horizontales, dos gráficos de media fila
 * comparten una fila del documento, como en pantalla. Módulo puro.
 */
import type { ReporteCatalogo } from "../catalogo"
import { distribuirAnchos, type EspecGrafico } from "../graficos"

export interface TamanoCaptura {
  ancho: number
  alto: number
}

type Orientacion = ReporteCatalogo["orientacionPdf"]

/** Píxeles por punto CSS de las capturas (2 = nítido al imprimir). */
export const DENSIDAD_CAPTURA = 2

/**
 * En horizontal la página es ancha y baja: los gráficos de fila completa se
 * dibujan más anchos y menos altos, para que dos filas de gráficos quepan en
 * una página sin achicar su texto.
 */
const ANCHO_COMPLETO: Readonly<Record<Orientacion, number>> = {
  vertical: 960,
  horizontal: 1200,
}
const ALTO_SERIE: Readonly<Record<Orientacion, number>> = {
  vertical: 340,
  horizontal: 260,
}
const ALTO_DONA: Readonly<Record<Orientacion, number>> = {
  vertical: 320,
  horizontal: 260,
}
const ALTO_CALOR: Readonly<Record<Orientacion, number>> = {
  vertical: 300,
  horizontal: 240,
}
const ANCHO_MITAD = 720
/** Cada gráfico de una pareja: más angosto para que su texto no se achique. */
const ANCHO_PAREJA = 600

interface MedidasLista {
  /** Alto por barra. */
  fila: number
  /** Eje de valores y, en las apiladas, la leyenda. */
  extra: number
  minimo: number
  maximo: Readonly<Record<Orientacion, number>>
}

const RANKING: MedidasLista = {
  fila: 30,
  extra: 56,
  minimo: 200,
  maximo: { vertical: 460, horizontal: 280 },
}

/**
 * Las barras apiladas horizontales llevan los nombres en el eje: con menos
 * de ~32 px por barra Chart.js omite nombres alternos, así que su alto no se
 * recorta a media página (un nombre faltante es peor que un gráfico alto).
 */
const APILADAS: MedidasLista = {
  fila: 34,
  extra: 84,
  minimo: 200,
  maximo: { vertical: 520, horizontal: 460 },
}

function altoLista(
  filas: number,
  medidas: MedidasLista,
  orientacion: Orientacion
): number {
  const alto = filas * medidas.fila + medidas.extra
  return Math.min(medidas.maximo[orientacion], Math.max(medidas.minimo, alto))
}

/** Barras visibles de un ranking: el top más la barra «Otros» si agrupa el resto. */
export function filasRanking(
  espec: Extract<EspecGrafico, { tipo: "ranking" }>
): number {
  const limite = espec.limite ?? espec.elementos.length
  const visibles = Math.min(limite, espec.elementos.length)
  const conResto =
    espec.agruparResto === true && espec.elementos.length > limite
  return visibles + (conResto ? 1 : 0)
}

export function tamanoCaptura(
  espec: EspecGrafico,
  orientacion: Orientacion = "vertical"
): TamanoCaptura {
  const ancho =
    espec.ancho === "completo" ? ANCHO_COMPLETO[orientacion] : ANCHO_MITAD
  switch (espec.tipo) {
    case "tendencia":
    case "combo":
      return { ancho, alto: ALTO_SERIE[orientacion] }
    case "dona":
      return { ancho: ANCHO_MITAD, alto: ALTO_DONA[orientacion] }
    case "ranking":
      return {
        ancho,
        alto: altoLista(filasRanking(espec), RANKING, orientacion),
      }
    case "apiladas":
      return espec.orientacion === "horizontal"
        ? {
            ancho,
            alto: altoLista(espec.categorias.length, APILADAS, orientacion),
          }
        : { ancho, alto: ALTO_SERIE[orientacion] }
    case "calor":
      return {
        ancho: ANCHO_COMPLETO[orientacion],
        alto: ALTO_CALOR[orientacion],
      }
    case "mapa":
      return { ancho: 520, alto: 712 }
  }
}

/**
 * Gráficos con datos agrupados en las filas del PDF. En horizontal, dos
 * gráficos de media fila seguidos van juntos; en vertical (y el mapa, que
 * lleva su leyenda al lado) cada uno ocupa su fila.
 */
export function filasGraficosPdf(
  graficos: readonly EspecGrafico[],
  orientacion: Orientacion
): EspecGrafico[][] {
  const conDatos = graficos.filter((grafico) => grafico.vacio === false)
  if (orientacion === "vertical") return conDatos.map((grafico) => [grafico])

  const anchos = distribuirAnchos(conDatos)
  const emparejable = (indice: number) =>
    anchos[indice] === "mitad" && conDatos[indice]?.tipo !== "mapa"
  const filas: EspecGrafico[][] = []
  for (let i = 0; i < conDatos.length; i++) {
    if (emparejable(i) && emparejable(i + 1)) {
      filas.push([conDatos[i], conDatos[i + 1]])
      i++
    } else {
      filas.push([conDatos[i]])
    }
  }
  return filas
}

/**
 * Tamaño de cada gráfico de una fila del PDF. Los de una pareja comparten el
 * alto (el del más alto) para que la fila quede pareja.
 */
export function tamanosFila(
  fila: readonly EspecGrafico[],
  orientacion: Orientacion
): TamanoCaptura[] {
  const tamanos = fila.map((espec) => tamanoCaptura(espec, orientacion))
  if (fila.length < 2) return tamanos
  const alto = Math.max(...tamanos.map((tamano) => tamano.alto))
  return fila.map(() => ({ ancho: ANCHO_PAREJA, alto }))
}
