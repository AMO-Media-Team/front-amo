import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Sparkline } from "@/components/charts/sparkline"
import { NumeroAnimado } from "@/components/motion/numero-animado"
import {
  calcularDelta,
  formatearDelta,
  formatearNumero,
  tendenciaDelta,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import type { TonoEvento } from "../catalogo"
import { CLASES_TONO } from "./distintivos"

export interface ComparacionIndicador {
  anterior: number
  /** "frente al periodo anterior". */
  texto: string
  /** `true`: subir es bueno; `false`: subir es malo; `null`: neutro. */
  subirEsBueno: boolean | null
}

function claseDelta(delta: number, subirEsBueno: boolean | null): string {
  const tendencia = tendenciaDelta(delta, 0)
  if (tendencia === "estable" || subirEsBueno === null) {
    return "bg-muted text-muted-foreground"
  }
  const bueno = (tendencia === "sube") === subirEsBueno
  return bueno
    ? "bg-success/12 text-success"
    : "bg-destructive/12 text-destructive"
}

function Variacion({
  valor,
  comparacion,
}: {
  valor: number
  comparacion: ComparacionIndicador
}) {
  const delta = calcularDelta(valor, comparacion.anterior)
  const titulo = `Periodo anterior: ${formatearNumero(comparacion.anterior)}`
  if (delta === null) {
    if (valor === 0) {
      return (
        <p className="text-xs text-muted-foreground" title={titulo}>
          Sin cambios
        </p>
      )
    }
    return (
      <p
        className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground"
        title={titulo}
      >
        <span className="inline-flex h-5 items-center rounded-full bg-primary/10 px-1.5 font-medium text-primary">
          Nuevo
        </span>
        <span className="max-sm:sr-only">sin actividad antes</span>
      </p>
    )
  }
  return (
    <p
      className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground"
      title={titulo}
    >
      <span
        className={cn(
          "inline-flex h-5 items-center rounded-full px-1.5 font-medium cifras",
          claseDelta(delta, comparacion.subirEsBueno)
        )}
      >
        {formatearDelta(delta, 0)}
      </span>
      <span className="max-sm:sr-only">{comparacion.texto}</span>
    </p>
  )
}

interface TarjetaIndicadorProps {
  titulo: string
  /** Título para móvil, donde las tarjetas van de a dos ("Sensibles"). */
  tituloCorto?: string
  valor: number
  formato?: "numero" | "porcentaje"
  Icono: LucideIcon
  tono: TonoEvento
  /** Posición en la fila (retraso de la animación de entrada). */
  indice: number
  comparacion?: ComparacionIndicador
  /** Tendencia del periodo (decorativa: la cifra y su variación van en texto). */
  serie?: readonly number[]
  detalle?: ReactNode
  /** Acción discreta al pie (p. ej. "Ver eventos"). */
  accion?: ReactNode
  /** Resalta la tarjeta (p. ej. hay accesos sospechosos). */
  alerta?: boolean
  className?: string
}

/**
 * Indicador del periodo: cifra animada, variación contra el periodo anterior
 * (el color depende de si subir es bueno), minigráfico y una línea de apoyo.
 */
export function TarjetaIndicador({
  titulo,
  tituloCorto,
  valor,
  formato = "numero",
  Icono,
  tono,
  indice,
  comparacion,
  serie,
  detalle,
  accion,
  alerta = false,
  className,
}: TarjetaIndicadorProps) {
  return (
    <article
      style={{ animationDelay: `${indice * 60}ms` }}
      className={cn(
        "relative flex min-w-0 animate-aparecer-arriba flex-col gap-2 overflow-hidden rounded-xl border bg-card p-3.5 motion-reduce:animate-none sm:p-4",
        alerta &&
          "border-warning/45 bg-[linear-gradient(160deg,color-mix(in_oklab,var(--warning)_9%,var(--card))_0%,var(--card)_60%)]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 text-[0.8125rem] font-medium text-muted-foreground">
          {tituloCorto ? (
            <>
              <span className="sm:hidden">{tituloCorto}</span>
              <span className="max-sm:hidden">{titulo}</span>
            </>
          ) : (
            titulo
          )}
        </h2>
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-lg sm:size-8",
            CLASES_TONO[tono].suave
          )}
        >
          <Icono className="size-4" aria-hidden />
        </span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className="font-heading text-2xl leading-none font-semibold tracking-tight sm:text-[1.75rem]">
          <NumeroAnimado
            valor={valor}
            formato={formato}
            decimales={formato === "porcentaje" ? 1 : 0}
          />
        </p>
        {serie && serie.length > 1 && serie.some((valor) => valor > 0) ? (
          <Sparkline
            valores={serie}
            ancho={96}
            alto={32}
            className="max-sm:hidden"
          />
        ) : null}
      </div>
      {comparacion ? (
        <Variacion valor={valor} comparacion={comparacion} />
      ) : null}
      {detalle || accion ? (
        <div className="mt-auto flex min-w-0 items-center justify-between gap-2 pt-0.5">
          {detalle ? (
            <p className="line-clamp-2 min-w-0 text-xs text-pretty text-muted-foreground">
              {detalle}
            </p>
          ) : null}
          {accion ? <div className="shrink-0">{accion}</div> : null}
        </div>
      ) : null}
    </article>
  )
}
