"use client"

import { ChevronRight, MapPinned } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { MiniMapaColombia } from "@/components/maps/mini-mapa-colombia"
import { type PeriodoEnlace, rutaExplorador } from "@/features/geo/rutas"
import {
  formatearCOPCompacto,
  formatearDelta,
  formatearPorcentaje,
  type Tendencia,
  tendenciaDelta,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  MAPA_EN_REJILLA,
  REJILLA_MAPA_RANKING,
} from "../../components/esqueletos-panel"
import { TarjetaPanel } from "../../components/tarjeta-panel"
import type { ZonaPanel } from "../datos"

const VISIBLES = 6

/** El explorador en ese departamento (o en Colombia), con el GMV del periodo. */
const hrefDepartamento = (codigo: string | null, periodo: PeriodoEnlace) =>
  rutaExplorador({ metrica: "gmv", departamento: codigo, periodo })

const TONO_TENDENCIA: Readonly<Record<Tendencia, string>> = {
  sube: "text-success",
  baja: "text-destructive",
  estable: "text-muted-foreground",
}

function Variacion({ zona }: { zona: ZonaPanel }) {
  if (zona.variacion === null) {
    return zona.valorAnterior === 0 && zona.valor > 0 ? (
      <span className="text-[0.6875rem] font-medium text-info">Nuevo</span>
    ) : null
  }
  return (
    <span
      className={cn(
        "text-[0.6875rem] font-medium cifras whitespace-nowrap",
        // Tras redondear: un «→ 0%» no es ni subida ni caída.
        TONO_TENDENCIA[tendenciaDelta(zona.variacion, 0)]
      )}
    >
      {formatearDelta(zona.variacion, 0)}
    </span>
  )
}

/** "Bogotá: $56,1 M, 24% del total, +18% frente al periodo anterior". */
function resumenZona(zona: ZonaPanel): string {
  const partes = [`${zona.nombre}: ${formatearCOPCompacto(zona.valor)}`]
  if (zona.participacion !== null) {
    partes.push(`${formatearPorcentaje(zona.participacion, 0)} del total`)
  }
  if (zona.variacion !== null) {
    const cambio = formatearDelta(zona.variacion, 0).replace(/^\S+\s/, "")
    partes.push(`${cambio} frente al periodo anterior`)
  } else if (zona.valorAnterior === 0 && zona.valor > 0) {
    partes.push("sin negocios en el periodo anterior")
  }
  return partes.join(", ")
}

/**
 * Top departamentos por GMV comprometido junto al mini-mapa coroplético.
 * Pasar por una fila resalta su departamento en el mapa; tocarla abre el
 * explorador geográfico en ese departamento con el mismo periodo.
 */
export function DepartamentosPanel({
  zonas,
  valores,
  periodo,
  conEnlaces,
  className,
}: {
  zonas: readonly ZonaPanel[]
  valores: Readonly<Record<string, number | null>>
  periodo: PeriodoEnlace
  /** Con `analitica.mapa`: filas y mapa llevan al explorador. */
  conEnlaces: boolean
  className?: string
}) {
  const [destacado, setDestacado] = useState<string | null>(null)
  const top = zonas.slice(0, VISIBLES)
  const maximo = Math.max(1, ...top.map((zona) => zona.valor))

  return (
    <TarjetaPanel
      titulo="Top departamentos"
      descripcion="GMV comprometido según el municipio del medio."
      icono={MapPinned}
      className={className}
      enlace={
        conEnlaces
          ? {
              href: hrefDepartamento(null, periodo),
              texto: "Abrir el explorador",
            }
          : undefined
      }
      pie={
        zonas.length > VISIBLES
          ? `${zonas.length} departamentos con negocios en el periodo`
          : null
      }
    >
      {zonas.length === 0 ? (
        <EstadoVacio
          variante="simple"
          icono={MapPinned}
          titulo="Sin negocios en el periodo"
          descripcion="Cuando los medios acepten ofertas verás aquí dónde se concentra el GMV."
          className="h-full py-6"
        />
      ) : (
        <div className={REJILLA_MAPA_RANKING}>
          <MiniMapaColombia
            valores={valores}
            metrica="gmv"
            etiqueta="GMV comprometido por departamento"
            destacado={destacado}
            enlazar={conEnlaces}
            periodo={periodo}
            className={MAPA_EN_REJILLA}
          />
          <ol
            className="flex min-w-0 flex-col gap-1"
            aria-label="Departamentos con más GMV"
          >
            {top.map((zona, indice) => {
              const contenido = (
                <>
                  <span
                    aria-hidden
                    className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-[0.6875rem] font-semibold cifras text-muted-foreground"
                  >
                    {indice + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[0.8125rem] font-medium">
                        {zona.nombre}
                      </span>
                      <span className="shrink-0 text-[0.8125rem] font-semibold cifras">
                        {formatearCOPCompacto(zona.valor)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-primary/80"
                          style={{ width: `${(zona.valor / maximo) * 100}%` }}
                        />
                      </span>
                      <span className="w-10 text-right text-[0.6875rem] cifras text-muted-foreground">
                        {formatearPorcentaje(zona.participacion, 0)}
                      </span>
                      <span className="w-12 text-right">
                        <Variacion zona={zona} />
                      </span>
                    </span>
                  </span>
                  {conEnlaces ? (
                    <ChevronRight
                      aria-hidden
                      className="size-4 shrink-0 text-muted-foreground/60 transition-transform duration-200 group-hover/fila:translate-x-0.5 group-hover/fila:text-foreground"
                    />
                  ) : null}
                </>
              )
              const clases =
                "group/fila flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors"
              return (
                <li
                  key={zona.codigo}
                  onPointerEnter={() => setDestacado(zona.codigo)}
                  onPointerLeave={() => setDestacado(null)}
                >
                  {conEnlaces ? (
                    <Link
                      href={hrefDepartamento(zona.codigo, periodo)}
                      onFocus={() => setDestacado(zona.codigo)}
                      onBlur={() => setDestacado(null)}
                      aria-label={`${resumenZona(zona)}. Abrir en el explorador`}
                      className={cn(
                        clases,
                        "hover:bg-muted/60 focus-visible:anillo-foco"
                      )}
                    >
                      {contenido}
                    </Link>
                  ) : (
                    <div className={clases}>{contenido}</div>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </TarjetaPanel>
  )
}
