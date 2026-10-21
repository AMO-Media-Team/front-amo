"use client"

import {
  ArrowRight,
  ChevronDown,
  CircleCheck,
  Info,
  type LucideIcon,
  OctagonAlert,
  Sparkles,
  TriangleAlert,
  TrendingUp,
} from "lucide-react"
import Link from "next/link"
import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { MAXIMO_INICIO } from "../motor"
import type { Insight, Severidad } from "../tipos"

interface EstiloSeveridad {
  etiqueta: string
  Icono: LucideIcon
  insignia: string
  acento: string
}

const SEVERIDADES: Readonly<Record<Severidad, EstiloSeveridad>> = {
  critico: {
    etiqueta: "Crítico",
    Icono: OctagonAlert,
    insignia: "bg-destructive/12 text-destructive ring-destructive/20",
    acento: "bg-destructive",
  },
  atencion: {
    etiqueta: "Atención",
    Icono: TriangleAlert,
    insignia: "bg-warning/12 text-warning ring-warning/25",
    acento: "bg-warning",
  },
  positivo: {
    etiqueta: "Positivo",
    Icono: TrendingUp,
    insignia: "bg-success/12 text-success ring-success/20",
    acento: "bg-success",
  },
  info: {
    etiqueta: "Información",
    Icono: Info,
    insignia: "bg-info/12 text-info ring-info/20",
    acento: "bg-info",
  },
}

function ElementoInsight({
  insight,
  indice,
}: {
  insight: Insight
  indice: number
}) {
  const { etiqueta, Icono, insignia, acento } = SEVERIDADES[insight.severidad]
  return (
    <li
      style={{ animationDelay: `${indice * 60}ms` }}
      className="group/insight relative flex animate-aparecer-arriba gap-3 overflow-hidden rounded-lg border bg-background/40 p-3 pl-4 transition-colors duration-200 hover:bg-muted/50 motion-reduce:animate-none"
    >
      <span
        aria-hidden
        className={cn("absolute inset-y-2 left-0 w-0.5 rounded-full", acento)}
      />
      <span
        className={cn(
          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset",
          insignia
        )}
      >
        <Icono aria-hidden className="size-4" />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm leading-snug font-semibold">
          <span className="sr-only">{etiqueta}: </span>
          {insight.titulo}
        </p>
        <p className="text-[0.8125rem] leading-relaxed text-pretty text-muted-foreground">
          {insight.detalle}
        </p>
        {insight.accion ? (
          <Link
            href={insight.accion.href}
            className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-sm text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:anillo-foco"
          >
            {insight.accion.etiqueta}
            <ArrowRight
              aria-hidden
              className="size-3.5 transition-transform duration-200 group-hover/insight:translate-x-0.5 motion-reduce:transition-none"
            />
          </Link>
        ) : null}
      </div>
    </li>
  )
}

/** "3 hallazgos, 1 crítico" (para lectores de pantalla). */
function resumenConteo(total: number, criticos: number): string {
  const hallazgos = `${total} ${total === 1 ? "hallazgo" : "hallazgos"}`
  if (criticos === 0) return hallazgos
  return `${hallazgos}, ${criticos} ${criticos === 1 ? "crítico" : "críticos"}`
}

interface PanelInsightsProps {
  insights: readonly Insight[]
  titulo?: string
  descripcion?: string
  /** Cuántos se muestran antes de "Ver todos" (4 en Inicio). */
  maximo?: number
  className?: string
}

/**
 * Hallazgos del periodo, ya priorizados por el motor: icono y acento por
 * severidad (nunca solo color: la severidad también se lee), acción sugerida y
 * aparición escalonada. Si no hay hallazgos, lo dice con un estado positivo.
 */
export function PanelInsights({
  insights,
  titulo = "Lo que cambió en el periodo",
  descripcion = "Hallazgos automáticos sobre tus indicadores, ordenados por prioridad.",
  maximo = MAXIMO_INICIO,
  className,
}: PanelInsightsProps) {
  const idTitulo = useId()
  const idLista = useId()
  const [expandido, setExpandido] = useState(false)
  const visibles = expandido ? insights : insights.slice(0, maximo)
  const ocultos = insights.length - maximo
  const criticos = insights.filter((i) => i.severidad === "critico").length

  return (
    <section
      aria-labelledby={idTitulo}
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5",
        className
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2
            id={idTitulo}
            className="flex items-center gap-2 font-heading text-[0.9375rem] font-semibold"
          >
            <Sparkles aria-hidden className="size-4 text-primary" />
            {titulo}
          </h2>
          <p className="text-[0.8125rem] text-muted-foreground">
            {descripcion}
          </p>
        </div>
        {insights.length > 0 ? (
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold cifras",
              criticos > 0
                ? "bg-destructive/12 text-destructive"
                : "bg-primary/10 text-primary"
            )}
          >
            <span aria-hidden>{insights.length}</span>
            <span className="sr-only">
              {resumenConteo(insights.length, criticos)}
            </span>
          </span>
        ) : null}
      </header>

      {insights.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed bg-background/40 p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-success/12 text-success">
            <CircleCheck aria-hidden className="size-4.5" />
          </span>
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-semibold">Todo en orden</p>
            <p className="text-[0.8125rem] text-muted-foreground">
              No hay variaciones significativas ni alertas en este periodo.
            </p>
          </div>
        </div>
      ) : (
        <ol id={idLista} className="flex flex-col gap-2">
          {visibles.map((insight, indice) => (
            <ElementoInsight
              key={insight.id}
              insight={insight}
              indice={indice}
            />
          ))}
        </ol>
      )}

      {ocultos > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={expandido}
          aria-controls={idLista}
          onClick={() => setExpandido((valor) => !valor)}
          className="self-start text-muted-foreground"
        >
          {expandido ? "Ver menos" : `Ver todos (${insights.length})`}
          <ChevronDown
            data-icon="inline-end"
            aria-hidden
            className={cn(
              "transition-transform duration-200",
              expandido && "rotate-180"
            )}
          />
        </Button>
      ) : null}
    </section>
  )
}
