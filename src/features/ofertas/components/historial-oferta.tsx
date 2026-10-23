import {
  Ban,
  CalendarClock,
  CircleCheck,
  FilePlus2,
  History,
  type LucideIcon,
  Megaphone,
  MessageSquareWarning,
  Send,
  ShieldX,
  Ticket,
  TicketPlus,
  TimerOff,
  Undo2,
  UserRound,
} from "lucide-react"

import { TarjetaFicha } from "@/features/usuarios/components/tarjeta-ficha"
import type { Tono } from "@/features/operacion/estados"
import { formatearFechaHoraFija } from "@/features/operacion/formato"
import { formatearFechaHora } from "@/lib/format"
import { cn } from "@/lib/utils"

import type { ClaseEvento, HistorialConstruido } from "../historial"

/** Cada clase de cambio tiene su ícono: la historia se lee de un vistazo. */
const ICONOS: Readonly<Record<ClaseEvento, LucideIcon>> = {
  creada: FilePlus2,
  enviada: Send,
  reenviada: Send,
  retirada: Undo2,
  devuelta: MessageSquareWarning,
  devuelta_sistema: TimerOff,
  publicada: Megaphone,
  rechazada: ShieldX,
  cancelada: Ban,
  cupos_completos: Ticket,
  cupo_liberado: TicketPlus,
  en_ejecucion: CalendarClock,
  vencida: TimerOff,
  cerrada: CircleCheck,
}

const ANILLOS: Readonly<Record<Tono, string>> = {
  exito: "text-success ring-success/30 bg-success/10",
  info: "text-info ring-info/30 bg-info/10",
  aviso: "text-warning ring-warning/35 bg-warning/12",
  peligro: "text-destructive ring-destructive/30 bg-destructive/10",
  neutro: "text-muted-foreground ring-border bg-muted",
}

/** Etiqueta del comentario según el cambio que lo trajo. */
function etiquetaComentario(clase: ClaseEvento): string {
  return clase === "devuelta" ? "Comentario" : "Motivo"
}

/**
 * Historia de la oferta, del primer al último hecho: cada cambio de estado
 * con quién lo hizo y el comentario de cada devolución o el motivo de un
 * rechazo o una cancelación (también los de devoluciones ya atendidas).
 */
export function HistorialOferta({
  historial,
  className,
}: {
  historial: HistorialConstruido
  className?: string
}) {
  const { eventos, reconstruido } = historial
  return (
    <TarjetaFicha
      titulo="Historial"
      icono={History}
      descripcion="Cada cambio de estado, quién lo hizo y sus comentarios."
      className={className}
    >
      <div className="flex flex-col gap-4">
        <ol
          aria-label="Cambios de la oferta"
          className="relative flex flex-col"
        >
          {eventos.map((evento, indice) => {
            const ultimo = indice === eventos.length - 1
            const Icono = ICONOS[evento.clase]
            return (
              <li
                key={evento.id}
                style={{ animationDelay: `${Math.min(indice, 14) * 40}ms` }}
                className="relative flex animate-aparecer-arriba gap-3 pb-5 last:pb-0 motion-reduce:animate-none"
              >
                {ultimo ? null : (
                  <span
                    aria-hidden
                    className="absolute top-8 bottom-0 left-[0.9375rem] w-px bg-border"
                  />
                )}
                <span
                  aria-hidden
                  className={cn(
                    "relative grid size-[1.875rem] shrink-0 place-items-center rounded-full ring-1",
                    ANILLOS[evento.tono]
                  )}
                >
                  <Icono className="size-3.5" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-medium text-pretty">
                      {evento.titulo}
                    </p>
                    <time
                      dateTime={evento.at}
                      title={formatearFechaHora(evento.at)}
                      className="text-xs cifras text-muted-foreground"
                    >
                      {formatearFechaHoraFija(evento.at)}
                    </time>
                  </div>
                  {evento.actor ? (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <UserRound aria-hidden className="size-3" />
                      <span className="sr-only">Por: </span>
                      {evento.actor}
                    </p>
                  ) : null}
                  {evento.comentario ? (
                    <figure className="mt-1 rounded-lg border-l-2 border-warning/60 bg-muted/40 px-3 py-2">
                      <figcaption className="text-[0.6875rem] font-medium text-muted-foreground">
                        {etiquetaComentario(evento.clase)}
                      </figcaption>
                      <blockquote className="text-sm text-pretty break-words whitespace-pre-line">
                        {evento.comentario}
                      </blockquote>
                    </figure>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ol>
        {reconstruido ? (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-pretty text-muted-foreground">
            Esta oferta es anterior al historial detallado: se muestran las
            fechas registradas en ella, sin quién hizo cada cambio.
          </p>
        ) : null}
      </div>
    </TarjetaFicha>
  )
}
