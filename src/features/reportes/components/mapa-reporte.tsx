"use client"

import { MapPinned } from "lucide-react"
import { useId, useState } from "react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { MiniMapaColombia } from "@/components/maps/mini-mapa-colombia"
import { DEFINICIONES_METRICAS } from "@/features/geo/metricas"
import type { PeriodoEnlace } from "@/features/geo/rutas"
import { cn } from "@/lib/utils"

import type { EspecGrafico } from "../graficos"

type EspecMapa = Extract<EspecGrafico, { tipo: "mapa" }>

function SelectorCapa({
  capas,
  activa,
  onCambiar,
}: {
  capas: EspecMapa["capas"]
  activa: number
  onCambiar: (indice: number) => void
}) {
  return (
    <div
      role="group"
      aria-label="Medida del mapa"
      className="flex w-full items-center rounded-lg bg-muted p-[3px]"
    >
      {capas.map((capa, indice) => {
        const elegida = indice === activa
        return (
          <button
            key={capa.metrica}
            type="button"
            aria-pressed={elegida}
            onClick={() => onCambiar(indice)}
            className={cn(
              "inline-flex h-7 min-w-0 flex-1 items-center justify-center rounded-md px-2 text-[0.8125rem] font-medium text-muted-foreground transition-all hover:text-foreground focus-visible:anillo-foco",
              elegida &&
                "bg-background text-foreground shadow-sm dark:bg-input/40"
            )}
          >
            <span className="truncate sm:hidden">
              {DEFINICIONES_METRICAS[capa.metrica].tituloCorto}
            </span>
            <span className="truncate max-sm:hidden">{capa.etiqueta}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Tarjeta del mapa de cobertura: mini-mapa coroplético por departamento con
 * la medida elegida (medios, GMV o alcance) y el departamento del filtro
 * resaltado. Mismo marco que `TarjetaGrafico`; el mapa es SVG, así que no
 * ofrece "Ver datos" (cada departamento ya se lee con su nombre y su cifra).
 */
export function MapaReporte({
  espec,
  periodoExplorador,
  className,
}: {
  espec: EspecMapa
  /**
   * Con `analitica.mapa`: cada departamento abre el explorador con la medida
   * elegida y este periodo (el del reporte). `null` = sin enlaces.
   */
  periodoExplorador: PeriodoEnlace | null
  className?: string
}) {
  const enlazar = periodoExplorador !== null
  const idTitulo = useId()
  const [activa, setActiva] = useState(0)
  const capa = espec.capas[activa] ?? espec.capas[0]
  const conValores =
    capa !== undefined &&
    Object.values(capa.valores).some((valor) => valor !== null && valor !== 0)

  return (
    <section
      aria-labelledby={idTitulo}
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 transition-colors duration-300 hover:border-foreground/15 sm:p-5",
        className
      )}
    >
      <header className="flex min-w-0 flex-col gap-1">
        <h3
          id={idTitulo}
          className="font-heading text-[0.9375rem] leading-snug font-semibold"
        >
          {espec.titulo}
        </h3>
        {espec.descripcion ? (
          <p className="text-[0.8125rem] text-muted-foreground">
            {espec.descripcion}
            {enlazar
              ? " Toca un departamento para abrirlo en el explorador."
              : null}
          </p>
        ) : null}
      </header>

      {espec.vacio || !capa ? (
        <EstadoVacio
          variante="simple"
          icono={MapPinned}
          titulo={espec.vacio ? espec.vacio.titulo : "Sin datos para el mapa"}
          descripcion={espec.vacio ? espec.vacio.descripcion : undefined}
          className="flex-1 py-6"
        />
      ) : (
        <>
          {espec.capas.length > 1 ? (
            <SelectorCapa
              capas={espec.capas}
              activa={activa}
              onCambiar={setActiva}
            />
          ) : null}
          <div className="relative flex flex-1 items-center justify-center">
            <MiniMapaColombia
              valores={capa.valores}
              metrica={capa.metrica}
              etiqueta={`${capa.etiqueta} por departamento`}
              destacado={espec.destacado}
              enlazar={enlazar}
              periodo={periodoExplorador ?? undefined}
              className={cn(
                "w-full max-w-[19rem] transition-opacity duration-300",
                !conValores && "opacity-45 saturate-50"
              )}
            />
            {conValores ? null : (
              <p className="pointer-events-none absolute top-[38%] left-1/2 w-max max-w-[85%] -translate-x-1/2 rounded-lg vidrio px-3 py-2 text-center text-xs text-pretty text-muted-foreground shadow-sm">
                Sin {capa.etiqueta.toLocaleLowerCase("es-CO")} en el periodo
              </p>
            )}
          </div>
        </>
      )}

      {espec.pie ? (
        <footer className="text-xs text-muted-foreground">{espec.pie}</footer>
      ) : null}
    </section>
  )
}
