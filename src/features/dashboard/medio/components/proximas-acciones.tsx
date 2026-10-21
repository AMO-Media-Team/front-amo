"use client"

import {
  CalendarCheck,
  ChartColumn,
  Clock,
  Download,
  PencilLine,
  Send,
} from "lucide-react"
import { useSyncExternalStore } from "react"

import { formatearFechaHora } from "@/lib/format"
import { cn } from "@/lib/utils"

import { TarjetaPanel } from "../../components/tarjeta-panel"
import {
  type AccionPendiente,
  cuentaRegresiva,
  etiquetaAccion,
  type Urgencia,
} from "../datos"

const PASO_RELOJ_MS = 30_000

function suscribirReloj(avisar: () => void) {
  const id = setInterval(avisar, PASO_RELOJ_MS)
  return () => clearInterval(id)
}

/** Instante redondeado al paso del reloj: estable entre lecturas del mismo tramo. */
function instanteActual(): number {
  return Math.floor(Date.now() / PASO_RELOJ_MS) * PASO_RELOJ_MS
}

/**
 * Reloj que avanza cada 30 s. En la hidratación usa la hora del servidor (sin
 * desajustes) y luego la del dispositivo.
 */
function useAhora(servidor: number): Date {
  return new Date(
    useSyncExternalStore(suscribirReloj, instanteActual, () => servidor)
  )
}

function IconoAccion({ accion }: { accion: string }) {
  if (accion === "DESCARGAR") return <Download className="size-4" />
  if (accion === "PUBLICAR") return <Send className="size-4" />
  if (accion.startsWith("CARGAR_METRICA")) {
    return <ChartColumn className="size-4" />
  }
  return <PencilLine className="size-4" />
}

const URGENCIAS: Readonly<
  Record<Urgencia, { chip: string; texto: string; barra: string }>
> = {
  vencida: {
    chip: "bg-destructive/12 text-destructive",
    texto: "text-destructive font-semibold",
    barra: "bg-destructive",
  },
  critica: {
    chip: "bg-destructive/12 text-destructive",
    texto: "text-destructive font-semibold",
    barra: "bg-destructive",
  },
  pronto: {
    chip: "bg-warning/10 text-warning",
    texto: "text-warning font-medium",
    barra: "bg-warning",
  },
  holgada: {
    chip: "bg-primary/10 text-primary",
    texto: "text-muted-foreground",
    barra: "bg-primary/40",
  },
}

/**
 * Tres líneas apiladas (acción, oferta, plazo): en la columna angosta de
 * escritorio y a 390 px, el plazo a la derecha partía la acción en dos líneas
 * y recortaba la oferta a unas pocas letras.
 */
function Accion({ accion, ahora }: { accion: AccionPendiente; ahora: Date }) {
  const cuenta = cuentaRegresiva(accion.venceAt, ahora)
  const estilo = URGENCIAS[cuenta.urgencia]
  return (
    <li className="relative flex items-start gap-3 overflow-hidden rounded-lg border bg-background/40 p-3 pl-3.5">
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-2 left-0 w-0.5 rounded-full",
          estilo.barra
        )}
      />
      <span
        aria-hidden
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg",
          estilo.chip
        )}
      >
        <IconoAccion accion={accion.accion} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[0.8125rem] leading-snug font-semibold">
          {etiquetaAccion(accion.accion)}
        </span>
        <span
          className="truncate text-xs text-muted-foreground"
          title={accion.ofertaTitulo}
        >
          {accion.ofertaTitulo}
        </span>
        <time
          dateTime={accion.venceAt ?? undefined}
          title={
            accion.venceAt ? formatearFechaHora(accion.venceAt) : undefined
          }
          className={cn(
            "mt-1 inline-flex items-center gap-1 text-xs cifras",
            estilo.texto
          )}
        >
          <Clock aria-hidden className="size-3 shrink-0" />
          {cuenta.texto}
        </time>
      </span>
    </li>
  )
}

/**
 * Lo que el medio debe hacer, del plazo más próximo al más lejano, con una
 * cuenta regresiva que se actualiza sola y se colorea por urgencia (además
 * del texto: el color nunca es el único canal).
 */
export function ProximasAcciones({
  acciones,
  ahoraServidor,
  className,
}: {
  acciones: readonly AccionPendiente[]
  /** `Date.now()` del servidor al pintar (hidratación sin desajustes). */
  ahoraServidor: number
  className?: string
}) {
  const ahora = useAhora(ahoraServidor)
  return (
    <TarjetaPanel
      titulo="Próximas acciones"
      descripcion="Tus pendientes, del plazo más cercano al más lejano."
      icono={CalendarCheck}
      className={className}
    >
      {acciones.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed bg-background/40 p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-success/12 text-success">
            <CalendarCheck aria-hidden className="size-4.5" />
          </span>
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-semibold">Nada pendiente</p>
            <p className="text-[0.8125rem] text-muted-foreground">
              Cuando aceptes una oferta verás aquí qué hacer y para cuándo.
            </p>
          </div>
        </div>
      ) : (
        <ol className="flex flex-col gap-2" aria-label="Acciones pendientes">
          {acciones.map((accion) => (
            <Accion
              key={`${accion.asignacionId}-${accion.accion}`}
              accion={accion}
              ahora={ahora}
            />
          ))}
        </ol>
      )}
    </TarjetaPanel>
  )
}
