"use client"

import {
  Activity,
  ChevronDown,
  Database,
  type LucideIcon,
  PencilLine,
  ShieldCheck,
} from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { formatearFechaHora, formatearRelativo } from "@/lib/format"
import { cn } from "@/lib/utils"

import { cargarActividad } from "../actions"
import { describirActividad, type TonoActividad } from "../presentacion"
import type { ActividadPropia, PaginaActividad } from "../tipos"

const TONOS: Readonly<
  Record<TonoActividad, { icono: LucideIcon; clase: string }>
> = {
  seguridad: { icono: ShieldCheck, clase: "bg-success/12 text-success" },
  edicion: { icono: PencilLine, clase: "bg-primary/12 text-primary" },
  datos: { icono: Database, clase: "bg-info/12 text-info" },
  neutro: { icono: Activity, clase: "bg-muted text-muted-foreground" },
}

function Evento({
  evento,
  usuarioId,
}: {
  evento: ActividadPropia
  usuarioId: string
}) {
  const descrito = describirActividad(evento, usuarioId)
  const { icono: Icono, clase } = TONOS[descrito.tono]
  const detalle = [evento.navegador, evento.ubicacion, evento.ip].filter(
    Boolean
  )

  return (
    <li className="group relative flex gap-4 pb-6 last:pb-0">
      <span
        aria-hidden
        className="absolute top-9 bottom-0 left-4 w-px -translate-x-1/2 bg-border group-last:hidden"
      />
      <span
        className={cn(
          "relative grid size-8 shrink-0 place-items-center rounded-full ring-4 ring-card",
          clase
        )}
      >
        <Icono className="size-4" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1">
        {/* En móvil el instante va siempre bajo el título (no según su largo). */}
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <p className="text-sm font-medium">{descrito.titulo}</p>
          <time
            dateTime={evento.at}
            title={formatearFechaHora(evento.at)}
            suppressHydrationWarning
            className="shrink-0 text-xs cifras text-muted-foreground"
          >
            {formatearRelativo(evento.at)}
          </time>
        </div>
        {detalle.length > 0 ? (
          <p className="truncate text-xs text-muted-foreground">
            {detalle.join(" · ")}
          </p>
        ) : null}
      </div>
    </li>
  )
}

/**
 * Línea de tiempo de lo que hizo la persona (`mi_actividad`), con carga por
 * cursor: «Ver más» pide la página anterior al último evento mostrado.
 */
export function ListaActividad({
  inicial,
  usuarioId,
}: {
  inicial: PaginaActividad
  usuarioId: string
}) {
  const [eventos, setEventos] = useState(inicial.eventos)
  const [siguiente, setSiguiente] = useState(inicial.siguiente)
  const [cargando, iniciar] = useTransition()

  const verMas = () => {
    if (siguiente === null) return
    iniciar(async () => {
      const resultado = await cargarActividad({ antesId: siguiente })
      if (!resultado.ok) {
        toast.error("No pudimos cargar más actividad", {
          description: resultado.error,
        })
        return
      }
      setEventos((actuales) => [...actuales, ...resultado.datos.eventos])
      setSiguiente(resultado.datos.siguiente)
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-col" aria-label="Actividad reciente">
        {eventos.map((evento) => (
          <Evento key={evento.id} evento={evento} usuarioId={usuarioId} />
        ))}
      </ol>
      {siguiente !== null ? (
        <Button
          variant="ghost"
          className="self-center"
          onClick={verMas}
          disabled={cargando}
        >
          {cargando ? (
            <Spinner data-icon="inline-start" aria-hidden />
          ) : (
            <ChevronDown data-icon="inline-start" aria-hidden />
          )}
          {cargando ? "Cargando…" : "Ver actividad anterior"}
        </Button>
      ) : eventos.length > 5 ? (
        <p className="text-center text-xs text-muted-foreground">
          Llegaste al inicio de tu actividad registrada.
        </p>
      ) : null}
    </div>
  )
}
