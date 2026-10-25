import {
  CalendarClock,
  CircleSlash,
  Eraser,
  History,
  Inbox,
  type LucideIcon,
  MessageSquareReply,
  MessageSquareWarning,
  SearchCheck,
  Stamp,
} from "lucide-react"

import { TarjetaFicha } from "@/features/usuarios/components/tarjeta-ficha"
import { formatearFechaHora } from "@/lib/format"

import type { EventoSolicitud, LineaTiempoSolicitud } from "../tipos"

const ICONOS: Readonly<Record<EventoSolicitud["tipo"], LucideIcon>> = {
  radicada: Stamp,
  tramite: SearchCheck,
  requerida: MessageSquareWarning,
  aportada: MessageSquareReply,
  prorrogada: CalendarClock,
  respondida: Inbox,
  desistida: CircleSlash,
  supresion: Eraser,
}

/**
 * Línea de tiempo de la solicitud: de la bitácora (cada cambio con su actor
 * enmascarado) o, sin acceso a ella, los hitos que guarda la solicitud.
 */
export function LineaTiempoSolicitud({
  linea,
}: {
  linea: LineaTiempoSolicitud
}) {
  return (
    <TarjetaFicha
      titulo="Línea de tiempo"
      icono={History}
      descripcion={
        linea.soloHitos
          ? "Los hitos de la solicitud. El detalle por persona está en la bitácora de auditoría."
          : "Cada cambio, de la bitácora de auditoría."
      }
    >
      {linea.eventos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin movimientos.</p>
      ) : (
        <ol aria-label="Historial de la solicitud" className="flex flex-col">
          {linea.eventos.map((evento, indice) => {
            const Icono = ICONOS[evento.tipo]
            const ultimo = indice === linea.eventos.length - 1
            return (
              <li
                key={evento.id}
                className="relative flex gap-3 pb-5 last:pb-0"
              >
                {ultimo ? null : (
                  <span
                    aria-hidden
                    className="absolute top-8 bottom-0 left-[0.9375rem] w-px bg-border"
                  />
                )}
                <span
                  aria-hidden
                  className="relative grid size-8 shrink-0 place-items-center rounded-full border bg-card text-muted-foreground"
                >
                  <Icono className="size-4" />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5 pt-1">
                  <p className="text-sm font-medium text-pretty">
                    {evento.titulo}
                  </p>
                  {evento.detalle ? (
                    <p className="text-sm text-pretty text-muted-foreground">
                      {evento.detalle}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    <time dateTime={evento.at}>
                      {formatearFechaHora(evento.at)}
                    </time>
                    {evento.actor ? ` · ${evento.actor}` : null}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </TarjetaFicha>
  )
}
