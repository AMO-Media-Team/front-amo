import {
  ArrowRight,
  BadgeAlert,
  CircleOff,
  CircleX,
  Hourglass,
  type LucideIcon,
  Quote,
} from "lucide-react"
import { useId } from "react"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import type { Tono } from "@/features/operacion/estados"
import { cn } from "@/lib/utils"

import { presentarSituacionEmpresa } from "../presentacion"
import type { EstadoAnunciante, SituacionEmpresa } from "../tipos"

const ICONOS: Readonly<
  Record<Exclude<EstadoAnunciante, "VERIFICADO">, LucideIcon>
> = {
  PENDIENTE: BadgeAlert,
  RECHAZADO: CircleX,
  SUSPENDIDO: CircleOff,
}

const TINTES: Readonly<Record<Tono, { tarjeta: string; icono: string }>> = {
  exito: {
    tarjeta: "border-success/35",
    icono: "bg-success/12 text-success ring-success/25",
  },
  info: {
    tarjeta: "border-primary/30",
    icono: "bg-primary/10 text-primary ring-primary/20",
  },
  aviso: {
    tarjeta: "border-warning/40",
    icono: "bg-warning/12 text-warning ring-warning/30",
  },
  peligro: {
    tarjeta: "border-destructive/40",
    icono: "bg-destructive/10 text-destructive ring-destructive/25",
  },
  neutro: { tarjeta: "", icono: "bg-muted text-muted-foreground ring-border" },
}

/**
 * Por qué la empresa aún no puede activar campañas y qué hacer: sin enviar a
 * verificación, en revisión desde cuándo, rechazada o suspendida con el
 * motivo del equipo AMO, y el enlace a «Mi empresa». No pinta nada si la
 * empresa ya está verificada.
 */
export function AvisoEmpresa({
  situacion,
  className,
}: {
  situacion: Pick<SituacionEmpresa, "estado" | "motivo" | "enviadaAt">
  className?: string
}) {
  const idTitulo = useId()
  const presentacion = presentarSituacionEmpresa(situacion)
  if (!presentacion || situacion.estado === "VERIFICADO") return null
  const Icono =
    situacion.estado === "PENDIENTE" && situacion.enviadaAt
      ? Hourglass
      : ICONOS[situacion.estado]
  const tinte = TINTES[presentacion.tono]
  return (
    <section
      aria-labelledby={idTitulo}
      className={cn(
        "flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5",
        tinte.tarjeta,
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-3.5">
        <span
          aria-hidden
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset",
            tinte.icono
          )}
        >
          <Icono className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2
            id={idTitulo}
            className="font-heading text-base leading-snug font-semibold text-balance"
          >
            {presentacion.titulo}
          </h2>
          <p className="text-sm text-pretty text-muted-foreground">
            {presentacion.descripcion}
          </p>
          {presentacion.motivo ? (
            <figure className="mt-1 flex gap-2.5 rounded-xl border bg-muted/30 p-3">
              <Quote
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
              <div className="flex min-w-0 flex-col gap-0.5">
                <figcaption className="text-xs font-medium text-muted-foreground">
                  Motivo del equipo AMO
                </figcaption>
                <blockquote className="text-sm break-words whitespace-pre-line">
                  {presentacion.motivo}
                </blockquote>
              </div>
            </figure>
          ) : null}
        </div>
      </div>
      <EnlaceBoton
        href={presentacion.accion.href}
        variant={presentacion.tono === "info" ? "outline" : "default"}
        className="shrink-0 max-sm:w-full"
      >
        {presentacion.accion.texto}
        <ArrowRight data-icon="inline-end" aria-hidden />
      </EnlaceBoton>
    </section>
  )
}
