"use client"

import { GraficoCombo } from "@/components/charts/grafico-combo"
import { GraficoDona } from "@/components/charts/grafico-dona"
import { TarjetaGrafico } from "@/components/charts/tarjeta-grafico"
import {
  formatearCompacto,
  formatearCOP,
  formatearPorcentaje,
} from "@/lib/format"

import { ALTO_DONA, POR_GRANULARIDAD } from "../../admin/datos"
import type { DesempenoPlataforma, SerieDesempeno } from "../datos"

/** Inversión verificada (columnas) y alcance (línea) en bandas apiladas. */
export function GraficoInversion({
  serie,
  className,
}: {
  serie: SerieDesempeno
  className?: string
}) {
  const totalInversion = serie.inversion.reduce((s, v) => s + v, 0)
  const totalAlcance = serie.alcance.reduce((s, v) => s + v, 0)
  const vacio = totalInversion === 0
  return (
    <TarjetaGrafico
      titulo="Inversión y alcance"
      descripcion={`Negocios cumplidos ${POR_GRANULARIDAD[serie.granularidad]}, por fecha de verificación.`}
      alto="min-h-80"
      className={className}
      vacio={
        vacio
          ? {
              titulo: "Aún no hay negocios verificados en el periodo",
              descripcion:
                "Cuando los medios publiquen y se validen sus métricas verás aquí tu inversión y el alcance logrado.",
            }
          : false
      }
      pie={
        vacio ? null : (
          <span className="cifras">
            {formatearCOP(totalInversion)} invertidos ·{" "}
            {formatearCompacto(totalAlcance)} personas alcanzadas (acumulado,
            sin deduplicar)
          </span>
        )
      }
    >
      <GraficoCombo
        titulo="Inversión y alcance"
        etiquetas={serie.etiquetas}
        barras={{
          id: "inversion",
          nombre: "Inversión",
          valores: serie.inversion,
          formato: "cop",
        }}
        linea={{
          id: "alcance",
          nombre: "Alcance",
          valores: serie.alcance,
          formato: "compacto",
        }}
      />
    </TarjetaGrafico>
  )
}

/**
 * CPM y engagement de cada red. Tabla hecha con `span` y roles ARIA: es el
 * pie de la tarjeta, que en pantalla completa va dentro de un `<p>`, donde
 * un `<table>` no es HTML válido.
 */
function TablaEficiencia({
  plataformas,
}: {
  plataformas: readonly DesempenoPlataforma[]
}) {
  return (
    <span
      role="table"
      aria-label="Eficiencia por plataforma en el periodo"
      className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] gap-x-5 text-xs"
    >
      <span
        role="row"
        className="col-span-3 grid grid-cols-subgrid pb-1 font-medium"
      >
        <span role="columnheader">Red</span>
        <span role="columnheader" className="text-right">
          CPM
        </span>
        <span role="columnheader" className="text-right">
          Engagement
        </span>
      </span>
      {plataformas.map((fila) => (
        <span
          key={fila.plataforma}
          role="row"
          className="col-span-3 grid grid-cols-subgrid border-t border-border/60 py-1 cifras text-foreground"
        >
          <span role="rowheader" className="font-medium">
            {fila.nombre}
          </span>
          <span role="cell" className="text-right">
            {formatearCOP(fila.cpm === null ? null : Math.round(fila.cpm))}
          </span>
          <span role="cell" className="text-right">
            {formatearPorcentaje(fila.engagement, 1)}
          </span>
        </span>
      ))}
    </span>
  )
}

/** Reparto de la inversión por red y eficiencia de cada una (CPM y engagement). */
export function GraficoPlataformasAnunciante({
  plataformas,
  className,
}: {
  plataformas: readonly DesempenoPlataforma[]
  className?: string
}) {
  const conInversion = plataformas.filter((p) => p.gmv > 0)
  return (
    <TarjetaGrafico
      titulo="Inversión por plataforma"
      descripcion="Dónde se ejecutó tu pauta y qué tan eficiente fue cada red."
      alto={ALTO_DONA}
      className={className}
      vacio={
        conInversion.length === 0
          ? {
              titulo: "Sin negocios verificados",
              descripcion: "El reparto aparece con tu primer negocio cumplido.",
            }
          : false
      }
      pie={
        conInversion.length ? (
          <TablaEficiencia plataformas={conInversion} />
        ) : null
      }
    >
      <GraficoDona
        titulo="Inversión por plataforma"
        segmentos={conInversion.map((fila) => ({
          id: fila.plataforma,
          nombre: fila.nombre,
          valor: fila.gmv,
        }))}
        formato="cop"
        etiquetaTotal="Inversión"
        nombreCategoria="Plataforma"
        maximo={3}
      />
    </TarjetaGrafico>
  )
}
