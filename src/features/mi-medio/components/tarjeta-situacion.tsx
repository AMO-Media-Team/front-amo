import {
  BadgeCheck,
  CircleOff,
  CircleX,
  ClipboardList,
  Hourglass,
  type LucideIcon,
  Quote,
} from "lucide-react"
import type { ReactNode } from "react"
import { useId } from "react"

import type { Tono } from "@/features/usuarios/presentacion"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import type { ProgresoAlta, SituacionMedio } from "../alta"
import { presentarSituacion } from "../presentacion"

const ICONOS: Readonly<Record<SituacionMedio["tipo"], LucideIcon>> = {
  alta: ClipboardList,
  "en-revision": Hourglass,
  rechazado: CircleX,
  verificado: BadgeCheck,
  suspendido: CircleOff,
}

const TINTES: Readonly<Record<Tono, string>> = {
  exito: "bg-success/12 text-success ring-success/25",
  info: "bg-primary/10 text-primary ring-primary/20",
  aviso: "bg-warning/12 text-warning ring-warning/30",
  peligro: "bg-destructive/10 text-destructive ring-destructive/25",
  neutro: "bg-muted text-muted-foreground ring-border",
}

const RADIO = 22
const CIRCUNFERENCIA = 2 * Math.PI * RADIO

/** Anillo de avance del alta (decorativo: la cifra va en texto). */
function AnilloAvance({ progreso }: { progreso: ProgresoAlta }) {
  const completo = progreso.completos === progreso.total
  return (
    <div className="relative grid size-16 shrink-0 place-items-center">
      <svg
        aria-hidden
        viewBox="0 0 52 52"
        className="absolute inset-0 size-full -rotate-90"
      >
        <circle
          cx="26"
          cy="26"
          r={RADIO}
          fill="none"
          strokeWidth="5"
          className="stroke-muted"
        />
        <circle
          cx="26"
          cy="26"
          r={RADIO}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={CIRCUNFERENCIA}
          strokeDashoffset={CIRCUNFERENCIA * (1 - progreso.fraccion)}
          className={cn(
            "transition-[stroke-dashoffset] duration-700 ease-suave motion-reduce:transition-none",
            completo ? "stroke-success" : "stroke-primary"
          )}
        />
      </svg>
      <span className="relative text-sm font-semibold cifras">
        {formatearNumero(progreso.completos)}
        <span className="text-muted-foreground">
          /{formatearNumero(progreso.total)}
        </span>
      </span>
    </div>
  )
}

/**
 * Situación de la verificación del medio: alta (con su avance), en revisión
 * desde cuándo, verificado con su nivel, rechazado o suspendido con el motivo
 * que dejó el equipo AMO. `children` lleva la acción principal.
 */
export function TarjetaSituacion({
  situacion,
  nombreNivel,
  progreso,
  pasosFaltantes,
  children,
  className,
}: {
  situacion: SituacionMedio
  nombreNivel: string | null
  progreso: ProgresoAlta
  pasosFaltantes: number
  children?: ReactNode
  className?: string
}) {
  const idTitulo = useId()
  const { titulo, descripcion, tono } = presentarSituacion(
    situacion,
    nombreNivel,
    pasosFaltantes
  )
  const Icono = ICONOS[situacion.tipo]
  const motivo =
    situacion.tipo === "rechazado" || situacion.tipo === "suspendido"
      ? situacion.motivo
      : null
  return (
    <section
      aria-labelledby={idTitulo}
      className={cn(
        "relative isolate flex flex-col gap-4 overflow-hidden rounded-2xl border bg-card p-5 sm:p-6",
        className
      )}
    >
      {situacion.tipo === "verificado" ? (
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-20 -z-10 size-72 rounded-full bg-aurora opacity-20 blur-3xl dark:opacity-25"
        />
      ) : null}
      <div className="flex items-start gap-4">
        {situacion.tipo === "alta" ? (
          <AnilloAvance progreso={progreso} />
        ) : (
          <span
            aria-hidden
            className={cn(
              "grid size-12 shrink-0 place-items-center rounded-2xl ring-1 ring-inset",
              TINTES[tono]
            )}
          >
            <Icono className="size-6" />
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2
            id={idTitulo}
            className="font-heading text-lg leading-snug font-semibold text-balance sm:text-xl"
          >
            {titulo}
          </h2>
          <p className="text-sm text-pretty text-muted-foreground">
            {descripcion}
          </p>
        </div>
      </div>
      {motivo ? (
        <figure className="flex gap-3 rounded-xl border bg-muted/30 p-3.5">
          <Quote
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <figcaption className="text-xs font-medium text-muted-foreground">
              Motivo del equipo AMO
            </figcaption>
            <blockquote className="text-sm break-words whitespace-pre-line">
              {motivo}
            </blockquote>
          </div>
        </figure>
      ) : null}
      {children}
    </section>
  )
}
