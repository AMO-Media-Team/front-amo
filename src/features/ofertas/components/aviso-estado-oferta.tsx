import {
  Ban,
  CalendarClock,
  CircleCheck,
  FilePen,
  Hourglass,
  type LucideIcon,
  Megaphone,
  MessageSquareWarning,
  ShieldX,
  Ticket,
  TimerOff,
} from "lucide-react"
import type { ReactNode } from "react"

import type { EstadoOferta, Tono } from "@/features/operacion/estados"
import { cn } from "@/lib/utils"

import { ID_AVISO_ESTADO_OFERTA } from "../foco"
import type { SituacionOferta } from "../presentacion"

const ICONOS: Readonly<Record<EstadoOferta, LucideIcon>> = {
  BORRADOR: FilePen,
  EN_REVISION: Hourglass,
  DEVUELTA: MessageSquareWarning,
  PUBLICADA: Megaphone,
  CUPOS_COMPLETOS: Ticket,
  EN_EJECUCION: CalendarClock,
  VENCIDA: TimerOff,
  CERRADA: CircleCheck,
  CANCELADA: Ban,
}

/** Un aviso por página: la ficha de la oferta. */
const ID_TITULO = "estado-oferta"

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

/**
 * Qué significa el estado de la oferta para quien la mira, con el comentario
 * de la devolución o el motivo del rechazo destacados. Es una región con
 * nombre (su título): se encuentra al recorrer la página y no interrumpe al
 * lector de pantalla al cargar, como haría una alerta. Tras un cambio de
 * estado confirmado en un diálogo recibe el foco (`useFocoTrasCambio`): el
 * botón que lo abrió ya no existe y así se anuncia el estado nuevo.
 */
export function AvisoEstadoOferta({
  estado,
  situacion,
  accion,
}: {
  estado: EstadoOferta
  situacion: SituacionOferta
  /** Enlace o botón para atenderlo (p. ej. «Corregir en el asistente»). */
  accion?: ReactNode
}) {
  const Icono = situacion.rechazada ? ShieldX : ICONOS[estado]
  const clases = CLASES[situacion.tono]
  return (
    <section
      id={ID_AVISO_ESTADO_OFERTA}
      tabIndex={-1}
      aria-labelledby={ID_TITULO}
      className={cn(
        "flex scroll-mt-20 flex-col gap-3 rounded-xl border p-4 outline-none focus-visible:anillo-foco sm:flex-row sm:items-start sm:gap-4",
        clases.caja
      )}
    >
      <Icono
        aria-hidden
        className={cn("size-5 shrink-0 sm:mt-0.5", clases.icono)}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 id={ID_TITULO} className="text-[0.9375rem] font-semibold">
            {situacion.titulo}
          </h2>
          <p className="text-sm text-pretty text-muted-foreground">
            {situacion.descripcion}
          </p>
        </div>
        {situacion.comentario ? (
          <figure className="rounded-lg border bg-background/70 px-3.5 py-2.5">
            <figcaption className="text-xs font-medium text-muted-foreground">
              {situacion.comentario.etiqueta}
            </figcaption>
            <blockquote className="mt-0.5 text-sm text-pretty break-words whitespace-pre-line">
              {situacion.comentario.texto}
            </blockquote>
          </figure>
        ) : null}
        {accion ? <div className="flex flex-wrap gap-2">{accion}</div> : null}
      </div>
    </section>
  )
}
