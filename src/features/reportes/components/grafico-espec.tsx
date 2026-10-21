"use client"

import { GraficoBarrasApiladas } from "@/components/charts/grafico-barras-apiladas"
import { GraficoBarrasRanking } from "@/components/charts/grafico-barras-ranking"
import { GraficoCombo } from "@/components/charts/grafico-combo"
import { GraficoDona } from "@/components/charts/grafico-dona"
import { GraficoTendencia } from "@/components/charts/grafico-tendencia"
import { MapaCalorActividad } from "@/components/charts/mapa-calor-actividad"

import type { EspecGrafico } from "../graficos"

/** Gráficos de Chart.js (el mapa es SVG y tiene su propia tarjeta). */
export type EspecGraficoLienzo = Exclude<EspecGrafico, { tipo: "mapa" }>

/**
 * Dibuja un gráfico del reporte a partir de su especificación serializable.
 * Lo usan la tarjeta en pantalla y la captura para el PDF: así el documento
 * muestra exactamente el mismo gráfico.
 */
export function GraficoEspec({ espec }: { espec: EspecGraficoLienzo }) {
  switch (espec.tipo) {
    case "tendencia":
      return (
        <GraficoTendencia
          titulo={espec.titulo}
          etiquetas={espec.etiquetas}
          series={espec.series}
          anterior={espec.anterior}
          formato={espec.formato}
        />
      )
    case "combo":
      return (
        <GraficoCombo
          titulo={espec.titulo}
          etiquetas={espec.etiquetas}
          barras={espec.barras}
          linea={espec.linea}
        />
      )
    case "dona":
      return (
        <GraficoDona
          titulo={espec.titulo}
          segmentos={espec.segmentos}
          formato={espec.formato}
          etiquetaTotal={espec.etiquetaTotal}
          nombreCategoria={espec.nombreCategoria}
        />
      )
    case "ranking":
      return (
        <GraficoBarrasRanking
          titulo={espec.titulo}
          elementos={espec.elementos}
          formato={espec.formato}
          nombreValor={espec.nombreValor}
          nombreCategoria={espec.nombreCategoria}
          limite={espec.limite}
          agruparResto={espec.agruparResto}
          destacado={espec.destacado}
        />
      )
    case "apiladas":
      return (
        <GraficoBarrasApiladas
          titulo={espec.titulo}
          categorias={espec.categorias}
          series={espec.series}
          formato={espec.formato}
          orientacion={espec.orientacion}
          nombreCategoria={espec.nombreCategoria}
        />
      )
    case "calor":
      return (
        <MapaCalorActividad
          titulo={espec.titulo}
          celdas={espec.celdas}
          unidad={espec.unidad}
        />
      )
  }
}
