"use client"

import { ChartNoAxesColumnDecreasing } from "lucide-react"

import { Esqueleto } from "@/components/feedback/esqueletos"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

import { departamentoPorCodigo } from "../departamentos"
import { formatearValorGeo, unidadGeo } from "../formato"
import { DEFINICIONES_METRICAS, type MetricaGeo } from "../metricas"
import { type EstadoNivel, TIPO_ZONA } from "../niveles"
import type { FilaRanking } from "../agregacion"
import type { VistaMapa } from "../vista-mapa"
import { RankingZonas } from "./ranking-zonas"

export interface PropsPanelRanking {
  vista: VistaMapa | null
  cargando: boolean
  estado: EstadoNivel
  metrica: MetricaGeo
  por100k: boolean
  seleccionado: string | null
  resaltado: string | null
  puedeExplorar: (codigo: string) => boolean
  onResaltar: (codigo: string | null) => void
  onSeleccionar: (codigo: string) => void
  onExplorar: (codigo: string) => void
  enFoco?: ((fila: FilaRanking) => boolean) | null
  className?: string
}

/** "del mundo", "de Colombia", "de Antioquia". */
function deAmbito(estado: EstadoNivel): string {
  if (estado.nivel === "internacional") return "del mundo"
  if (estado.nivel === "nacional") return "de Colombia"
  const departamento = departamentoPorCodigo(estado.departamento)
  return departamento ? `de ${departamento.nombreCorto}` : "del departamento"
}

function etiquetaTotal(
  estado: EstadoNivel,
  metrica: MetricaGeo,
  por100k: boolean
): string {
  const ambito = deAmbito(estado)
  if (!DEFINICIONES_METRICAS[metrica].aditiva)
    return `Promedio ponderado ${ambito}`
  if (por100k) return `Tasa ${ambito} · por 100 mil hab.`
  return `Total ${ambito}`
}

function EsqueletoRanking() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex flex-col gap-3.5 px-3 py-2"
    >
      <span className="sr-only">Cargando el ranking…</span>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Esqueleto className="size-6 rounded-md" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Esqueleto className="h-3 w-3/5" />
            <Esqueleto className="h-1 w-full rounded-full" />
          </div>
          <Esqueleto className="h-3 w-10" />
        </div>
      ))}
    </div>
  )
}

/** Encabezado con el total del ámbito y el ranking navegable. */
export function PanelRanking({
  vista,
  cargando,
  estado,
  metrica,
  por100k,
  seleccionado,
  resaltado,
  puedeExplorar,
  onResaltar,
  onSeleccionar,
  onExplorar,
  enFoco = null,
  className,
}: PropsPanelRanking) {
  const tipo = TIPO_ZONA[estado.nivel]
  const unidad = unidadGeo(metrica, por100k)
  const total = vista?.ranking.total ?? null

  return (
    <section
      aria-label={`Ranking de ${tipo.plural}`}
      className={cn("flex min-h-0 flex-col", className)}
    >
      <header className="flex flex-col gap-3 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            <ChartNoAxesColumnDecreasing
              aria-hidden
              className="size-3.5 text-primary"
            />
            Ranking de {tipo.plural}
          </h2>
          {vista ? (
            <span className="rounded-full bg-foreground/6 px-2 py-0.5 text-[0.6875rem] cifras text-muted-foreground">
              {vista.ranking.conDatos} con datos
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-muted-foreground">
            {etiquetaTotal(estado, metrica, por100k)}
          </p>
          {vista ? (
            <p className="font-heading text-2xl leading-tight font-bold cifras tracking-tight">
              {formatearValorGeo(total, metrica, { por100k })}
              {unidad && !por100k && total !== null ? (
                <span className="ml-1.5 text-sm font-medium text-muted-foreground">
                  {unidad}
                </span>
              ) : null}
            </p>
          ) : (
            <Esqueleto className="mt-1 h-7 w-36" />
          )}
        </div>
      </header>
      <div aria-hidden className="mx-4 h-px bg-foreground/8" />
      <ScrollArea className="min-h-0 flex-1">
        <div
          className={cn(
            "px-2 py-2 transition-opacity duration-200",
            cargando && vista && "opacity-60"
          )}
        >
          {vista ? (
            <RankingZonas
              ranking={vista.ranking}
              metrica={metrica}
              por100k={por100k}
              colorDe={vista.escala.colorPara}
              seleccionado={seleccionado}
              resaltado={resaltado}
              puedeExplorar={puedeExplorar}
              onResaltar={onResaltar}
              onSeleccionar={onSeleccionar}
              onExplorar={onExplorar}
              zonaSingular={tipo.singular}
              enFoco={enFoco}
            />
          ) : (
            <EsqueletoRanking />
          )}
        </div>
      </ScrollArea>
    </section>
  )
}
