import {
  BadgeCheck,
  Ban,
  CircleSlash,
  type LucideIcon,
  RotateCcw,
  Scale,
  SearchCheck,
  Undo2,
} from "lucide-react"
import type { ReactNode } from "react"

import { InsigniaTono } from "@/features/operacion/components/distintivos"
import type { Tono } from "@/features/operacion/estados"
import { formatearFechaHoraFija } from "@/features/operacion/formato"
import { cn } from "@/lib/utils"

import { ID_ESTADO_DISPUTA } from "../foco"
import {
  type ClaveSituacion,
  type ContextoDisputa,
  MOTIVOS,
  presentacionEstado,
  quienAbrio,
  situacionDisputa,
} from "../presentacion"
import type { DisputaDetalle, EstadoDisputa, Perspectiva } from "../tipos"

const ICONOS: Readonly<Record<ClaveSituacion, LucideIcon>> = {
  abierta: Scale,
  revision: SearchCheck,
  restaurada: Undo2,
  verificada: BadgeCheck,
  reabierta: RotateCcw,
  cancelada: Ban,
  descartada: CircleSlash,
}

const CLASES: Readonly<Record<Tono, { caja: string; icono: string }>> = {
  exito: { caja: "border-success/40 bg-success/8", icono: "text-success" },
  info: { caja: "border-info/40 bg-info/8", icono: "text-info" },
  aviso: { caja: "border-warning/45 bg-warning/10", icono: "text-warning" },
  peligro: {
    caja: "border-destructive/40 bg-destructive/8",
    icono: "text-destructive",
  },
  neutro: { caja: "bg-muted/30", icono: "text-muted-foreground" },
}

/** Estado de la disputa con el tono y la etiqueta de quien mira. */
export function InsigniaEstadoDisputa({
  estado,
  perspectiva,
  className,
}: {
  estado: EstadoDisputa
  perspectiva: Perspectiva
  className?: string
}) {
  const { etiqueta, tono, descripcion } = presentacionEstado(
    estado,
    perspectiva
  )
  return (
    <InsigniaTono
      tono={tono}
      etiqueta={etiqueta}
      titulo={descripcion}
      className={className}
    />
  )
}

export interface EstadoDisputaProps {
  disputa: Pick<
    DisputaDetalle,
    | "estado"
    | "parte"
    | "motivo"
    | "estadoOrigen"
    | "estadoResultante"
    | "resolucion"
    | "creadaAt"
    | "resueltaAt"
  >
  perspectiva: Perspectiva
  /**
   * Lo que se sabe de la asignación para contar el resultado: el nuevo plazo
   * de la evidencia tras reabrir una vencida y la causa de una cancelación.
   */
  contexto?: ContextoDisputa
  /** Enlace o botón para atenderlo (p. ej. «Cargar la evidencia»). */
  accion?: ReactNode
  className?: string
}

/**
 * Qué significa la disputa para quien mira (ADM-011, ADM-012): abierta, quién
 * la abrió y qué queda en pausa; cerrada, el resultado en su voz y la
 * explicación del equipo AMO. Es una región con nombre (su título), no una
 * alerta: no interrumpe al lector de pantalla al cargar. Tras una decisión
 * tomada en un diálogo recibe el foco (`ID_ESTADO_DISPUTA`): el botón que lo
 * abrió ya no existe y así se anuncia el estado nuevo. Uno por página.
 */
export function EstadoDisputa({
  disputa,
  perspectiva,
  contexto,
  accion,
  className,
}: EstadoDisputaProps) {
  const situacion = situacionDisputa(disputa, perspectiva, contexto)
  const Icono = ICONOS[situacion.clave]
  const clases = CLASES[situacion.tono]
  const idTitulo = `${ID_ESTADO_DISPUTA}-titulo`
  return (
    <section
      id={ID_ESTADO_DISPUTA}
      tabIndex={-1}
      aria-labelledby={idTitulo}
      className={cn(
        "flex scroll-mt-20 flex-col gap-3 rounded-xl border p-4 outline-none focus-visible:anillo-foco sm:flex-row sm:items-start sm:gap-4",
        clases.caja,
        className
      )}
    >
      <Icono
        aria-hidden
        className={cn("size-5 shrink-0 sm:mt-0.5", clases.icono)}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id={idTitulo}
              className="text-[0.9375rem] font-semibold text-pretty"
            >
              {situacion.titulo}
            </h2>
            <InsigniaEstadoDisputa
              estado={disputa.estado}
              perspectiva={perspectiva}
              className="h-5 bg-card px-2 text-[0.6875rem]"
            />
          </div>
          <p className="text-sm text-pretty text-muted-foreground">
            {situacion.descripcion}
          </p>
        </div>
        {disputa.resolucion ? (
          <figure className="rounded-lg border bg-background/70 px-3.5 py-2.5">
            <figcaption className="text-xs font-medium text-muted-foreground">
              Explicación del equipo AMO
            </figcaption>
            <blockquote className="mt-0.5 text-sm text-pretty break-words whitespace-pre-line">
              {disputa.resolucion}
            </blockquote>
          </figure>
        ) : null}
        <p className="text-xs text-pretty text-muted-foreground">
          {quienAbrio(disputa.parte, perspectiva)} el{" "}
          <time dateTime={disputa.creadaAt} className="cifras">
            {formatearFechaHoraFija(disputa.creadaAt)}
          </time>{" "}
          · Motivo:{" "}
          {MOTIVOS[disputa.motivo].etiqueta.toLocaleLowerCase("es-CO")}
          {disputa.resueltaAt ? (
            <>
              {" "}
              · Cerrada el{" "}
              <time dateTime={disputa.resueltaAt} className="cifras">
                {formatearFechaHoraFija(disputa.resueltaAt)}
              </time>
            </>
          ) : null}
        </p>
        {accion ? <div className="flex flex-wrap gap-2">{accion}</div> : null}
      </div>
    </section>
  )
}
