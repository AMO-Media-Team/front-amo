import type { Route } from "next"
import Link from "next/link"
import type { CSSProperties, ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { formatearFechaHora, formatearRelativo } from "@/lib/format"
import { cn } from "@/lib/utils"

import { etiquetaCategoria } from "../presentacion"
import type { Notificacion, Prioridad } from "../tipos"
import { IconoNotificacion } from "./icono-notificacion"

const PRIORIDADES: Readonly<
  Record<Exclude<Prioridad, "normal">, { texto: string; clase: string }>
> = {
  importante: {
    texto: "Importante",
    clase: "border-warning/30 bg-warning/10 text-warning",
  },
  urgente: {
    texto: "Urgente",
    clase: "border-destructive/30 bg-destructive/10 text-destructive",
  },
}

function MarcaPrioridad({ prioridad }: { prioridad: Prioridad }) {
  if (prioridad === "normal") return null
  const { texto, clase } = PRIORIDADES[prioridad]
  return (
    <Badge
      variant="outline"
      className={cn("h-5 px-1.5 text-[0.6875rem]", clase)}
    >
      {texto}
    </Badge>
  )
}

/**
 * Título: si la notificación lleva a una entidad, es un enlace que cubre toda
 * la fila (`after:inset-0`); las acciones quedan por encima con `z-10`.
 */
function Titulo({
  notificacion,
  onAbrir,
}: {
  notificacion: Notificacion
  onAbrir?: (notificacion: Notificacion) => void
}) {
  const contenido = (
    <>
      {/* El espacio va fuera del span: el nombre accesible no lo recorta. */}
      {notificacion.leida ? null : (
        <>
          <span className="sr-only">Sin leer:</span>{" "}
        </>
      )}
      {notificacion.titulo}
    </>
  )
  if (!notificacion.url) return contenido
  return (
    <Link
      href={notificacion.url as Route}
      onClick={() => onAbrir?.(notificacion)}
      className="rounded-sm outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:anillo-foco"
    >
      {contenido}
    </Link>
  )
}

interface ItemNotificacionProps {
  notificacion: Notificacion
  /** `compacta` en el panel de la campana; `completa` en la bandeja. */
  variante?: "compacta" | "completa"
  /** Al abrir el enlace (p. ej. marcarla como leída). */
  onAbrir?: (notificacion: Notificacion) => void
  /** Botones a la derecha (marcar leída…), por encima del enlace de la fila. */
  acciones?: ReactNode
  className?: string
  style?: CSSProperties
}

export function ItemNotificacion({
  notificacion,
  variante = "completa",
  onAbrir,
  acciones,
  className,
  style,
}: ItemNotificacionProps) {
  const compacta = variante === "compacta"
  const { leida } = notificacion

  return (
    <li
      style={style}
      className={cn(
        "group/notificacion relative flex gap-3 transition-colors",
        compacta ? "px-3 py-3" : "px-4 py-4 sm:gap-3.5 sm:px-5",
        notificacion.url && "focus-within:bg-muted/50 hover:bg-muted/50",
        leida ? null : "bg-primary/[0.04] dark:bg-primary/[0.06]",
        className
      )}
    >
      {leida ? null : (
        <span
          aria-hidden
          className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-primary"
        />
      )}
      <IconoNotificacion tipo={notificacion.tipo} leida={leida} />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <p
            className={cn(
              "min-w-0 text-sm leading-snug text-pretty",
              leida ? "font-medium text-foreground/80" : "font-semibold"
            )}
          >
            <Titulo notificacion={notificacion} onAbrir={onAbrir} />
          </p>
          <time
            dateTime={notificacion.creadaAt}
            title={formatearFechaHora(notificacion.creadaAt)}
            suppressHydrationWarning
            className="shrink-0 pt-px text-xs whitespace-nowrap text-muted-foreground"
          >
            {formatearRelativo(notificacion.creadaAt)}
          </time>
        </div>
        <p
          className={cn(
            "text-muted-foreground",
            compacta
              ? "line-clamp-2 text-xs leading-relaxed"
              : "line-clamp-3 text-sm"
          )}
        >
          {notificacion.mensaje}
        </p>
        <div className="mt-0.5 flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{etiquetaCategoria(notificacion.tipo)}</span>
          <MarcaPrioridad prioridad={notificacion.prioridad} />
          {acciones ? (
            <span className="relative z-10 ml-auto flex items-center gap-1">
              {acciones}
            </span>
          ) : null}
        </div>
      </div>
    </li>
  )
}
