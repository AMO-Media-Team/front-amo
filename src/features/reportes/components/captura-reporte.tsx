"use client"

import { capturarLienzo } from "@/components/charts/captura"
import { construirTemaGraficos, estiloLienzo } from "@/components/charts/tema"
import {
  componerImagenGrafico,
  type EstiloLienzo,
  lienzoAPng,
} from "@/lib/export/imagen"

import type { ReporteCatalogo } from "../catalogo"
import type { ImagenGrafico } from "../exportacion/documento"
import { mapaColombiaSvg } from "../exportacion/mapa-svg"
import {
  DENSIDAD_CAPTURA,
  filasGraficosPdf,
  type TamanoCaptura,
  tamanosFila,
} from "../exportacion/tamanos"
import type { EspecGrafico } from "../graficos"
import { GraficoEspec } from "./grafico-espec"

type EspecMapa = Extract<EspecGrafico, { tipo: "mapa" }>

/** Tema claro de los documentos (se imprimen sobre blanco). */
function estiloDocumento(): EstiloLienzo {
  const fuente = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-geist-sans")
    .trim()
  return estiloLienzo(construirTemaGraficos({ modo: "claro", fuente }))
}

async function cargarImagen(svg: string): Promise<HTMLImageElement> {
  const imagen = new Image()
  imagen.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await imagen.decode()
  return imagen
}

/**
 * El mapa (SVG) rasterizado a doble densidad y compuesto como los demás
 * gráficos: título, leyenda de clases al lado y fondo claro. El lienzo se
 * monta fuera de pantalla un instante para que la composición lea su tamaño
 * CSS (y con él la densidad).
 */
async function lienzoMapa(espec: EspecMapa): Promise<HTMLCanvasElement> {
  const capa = espec.capas[0]
  if (!capa) throw new Error("Mapa sin capas")
  const mapa = mapaColombiaSvg({
    valores: capa.valores,
    metrica: capa.metrica,
    destacado: espec.destacado,
    ancho: 420,
  })
  const imagen = await cargarImagen(mapa.svg)
  const lienzo = document.createElement("canvas")
  lienzo.width = mapa.ancho * DENSIDAD_CAPTURA
  lienzo.height = mapa.alto * DENSIDAD_CAPTURA
  Object.assign(lienzo.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${mapa.ancho}px`,
    height: `${mapa.alto}px`,
  })
  const contexto = lienzo.getContext("2d")
  if (!contexto) throw new Error("Canvas 2D no disponible")
  contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height)

  document.body.append(lienzo)
  try {
    return componerImagenGrafico(lienzo, {
      estilo: estiloDocumento(),
      titulo: `${espec.titulo}: ${capa.etiqueta.toLocaleLowerCase("es-CO")}`,
      leyenda: mapa.leyenda.map((clase) => ({
        nombre: clase.nombre,
        color: clase.color,
        marca: "bloque",
      })),
      leyendaAlLado: true,
      conSello: false,
    })
  } finally {
    lienzo.remove()
  }
}

function lienzoEspec(
  espec: EspecGrafico,
  tamano: TamanoCaptura
): Promise<HTMLCanvasElement> {
  if (espec.tipo === "mapa") return lienzoMapa(espec)
  return capturarLienzo(<GraficoEspec espec={espec} />, {
    ...tamano,
    titulo: espec.titulo,
    descripcion: espec.descripcion,
    modo: "claro",
    densidad: DENSIDAD_CAPTURA,
    conSello: false,
  })
}

/** Dos gráficos ya compuestos, uno al lado del otro y alineados arriba. */
function unirLienzos(lienzos: readonly HTMLCanvasElement[]): HTMLCanvasElement {
  if (lienzos.length === 1) return lienzos[0]
  const union = document.createElement("canvas")
  union.width = lienzos.reduce((total, lienzo) => total + lienzo.width, 0)
  union.height = Math.max(...lienzos.map((lienzo) => lienzo.height))
  const contexto = union.getContext("2d")
  if (!contexto) throw new Error("Canvas 2D no disponible")
  contexto.fillStyle = estiloDocumento().superficie
  contexto.fillRect(0, 0, union.width, union.height)
  let x = 0
  for (const lienzo of lienzos) {
    contexto.drawImage(lienzo, x, 0)
    x += lienzo.width
  }
  return union
}

export interface CapturasReporte {
  imagenes: ImagenGrafico[]
  /** Títulos de los gráficos que no se pudieron dibujar. */
  fallidos: string[]
}

/**
 * Dibuja, uno a uno y en claro, los gráficos con datos del reporte para
 * incrustarlos en el PDF, ya agrupados en las filas del documento (en
 * horizontal, dos gráficos de media fila comparten imagen). Un gráfico que
 * falla no detiene el documento: se informa al final.
 */
export async function capturarGraficosReporte(
  graficos: readonly EspecGrafico[],
  orientacion: ReporteCatalogo["orientacionPdf"],
  alAvanzar?: (hechos: number, total: number) => void
): Promise<CapturasReporte> {
  const filas = filasGraficosPdf(graficos, orientacion)
  const total = filas.reduce((suma, fila) => suma + fila.length, 0)
  const imagenes: ImagenGrafico[] = []
  const fallidos: string[] = []
  let hechos = 0
  for (const fila of filas) {
    const tamanos = tamanosFila(fila, orientacion)
    const dibujados: { id: string; lienzo: HTMLCanvasElement }[] = []
    for (const [indice, espec] of fila.entries()) {
      alAvanzar?.(hechos++, total)
      try {
        dibujados.push({
          id: espec.id,
          lienzo: await lienzoEspec(espec, tamanos[indice]),
        })
      } catch {
        fallidos.push(espec.titulo)
      }
    }
    if (dibujados.length === 0) continue
    try {
      imagenes.push({
        ids: dibujados.map((dibujado) => dibujado.id),
        imagen: lienzoAPng(unirLienzos(dibujados.map((d) => d.lienzo))),
      })
    } catch {
      const ids = new Set(dibujados.map((dibujado) => dibujado.id))
      fallidos.push(...fila.filter((e) => ids.has(e.id)).map((e) => e.titulo))
    }
  }
  return { imagenes, fallidos }
}
