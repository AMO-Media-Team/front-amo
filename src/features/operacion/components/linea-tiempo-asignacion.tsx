import {
  BadgeCheck,
  Ban,
  Banknote,
  ChartColumn,
  Check,
  CircleCheck,
  CircleSlash,
  Download,
  Handshake,
  ImageOff,
  ImageUp,
  Landmark,
  type LucideIcon,
  Scale,
  TimerOff,
  Undo2,
  UserRound,
} from "lucide-react"

import { formatearFechaHora, formatearRelativo } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  ESTADOS_ASIGNACION,
  type EstadoAsignacion,
  type Tono,
} from "../estados"
import { formatearDiaMes } from "../formato"
import type {
  EventoLineaTiempo,
  PasoProgreso,
  Progreso,
  SituacionPaso,
} from "../linea-tiempo"
import { CLASES_TONO } from "./distintivos"

/** Cada paso de la máquina de estados tiene su ícono: la historia se lee de un vistazo. */
const ICONOS_ESTADO: Readonly<Record<EstadoAsignacion, LucideIcon>> = {
  ACEPTADA: Handshake,
  CONTENIDO_ENTREGADO: Download,
  PUBLICADA: ImageUp,
  EVIDENCIA_VALIDADA: BadgeCheck,
  METRICAS_CARGADAS: ChartColumn,
  VERIFICADA: CircleCheck,
  LIQUIDADA: Landmark,
  PAGADA: Banknote,
  RECHAZADA: CircleSlash,
  VENCIDA_SIN_PUBLICAR: TimerOff,
  EN_DISPUTA: Scale,
  CANCELADA: Ban,
}

/**
 * Un retroceso (evidencia o métricas rechazadas, liquidación anulada) llega en
 * tono de peligro a un estado que por sí mismo no lo es.
 */
function esRetroceso(evento: EventoLineaTiempo): boolean {
  return (
    evento.categoria === "estado" &&
    evento.estado !== null &&
    evento.tono === "peligro" &&
    ESTADOS_ASIGNACION[evento.estado].tono !== "peligro"
  )
}

function IconoEvento({ evento }: { evento: EventoLineaTiempo }) {
  const clase = "size-3.5"
  if (evento.categoria === "evidencia") return <ImageOff className={clase} />
  if (evento.categoria === "metrica") return <ChartColumn className={clase} />
  if (evento.categoria === "disputa") return <Scale className={clase} />
  if (esRetroceso(evento)) return <Undo2 className={clase} />
  const Icono = evento.estado ? ICONOS_ESTADO[evento.estado] : Handshake
  return <Icono className={clase} />
}

const ANILLOS: Readonly<Record<Tono, string>> = {
  exito: "text-success ring-success/30 bg-success/10",
  info: "text-info ring-info/30 bg-info/10",
  aviso: "text-warning ring-warning/35 bg-warning/12",
  peligro: "text-destructive ring-destructive/30 bg-destructive/10",
  neutro: "text-muted-foreground ring-border bg-muted",
}

/**
 * Historia de la asignación, del primer al último hecho: transiciones de
 * estado (con actor y motivo si vienen de la bitácora), evidencias o
 * métricas rechazadas, cortes cargados y disputas.
 */
export function LineaTiempoAsignacion({
  eventos,
  conBitacora,
}: {
  eventos: readonly EventoLineaTiempo[]
  conBitacora: boolean
}) {
  return (
    <div className="flex flex-col gap-4">
      <ol className="relative flex flex-col">
        {eventos.map((evento, indice) => {
          const ultimo = indice === eventos.length - 1
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
                <IconoEvento evento={evento} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className="text-sm font-medium text-pretty">
                    {evento.titulo}
                  </p>
                  <time
                    dateTime={evento.at}
                    title={formatearFechaHora(evento.at)}
                    className="text-xs cifras whitespace-nowrap text-muted-foreground"
                  >
                    {formatearFechaHora(evento.at)}
                  </time>
                </div>
                {evento.detalle ? (
                  <p className="text-xs text-pretty text-muted-foreground">
                    {evento.detalle}
                  </p>
                ) : null}
                {evento.actor ? (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <UserRound aria-hidden className="size-3" />
                    {evento.actor}
                  </p>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
      {conBitacora ? null : (
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Se muestran los instantes registrados en la asignación. Quién hizo
          cada cambio y por qué queda en la bitácora de auditoría.
        </p>
      )}
    </div>
  )
}

// ── Progreso por el camino feliz ─────────────────────────────────────────────

const SITUACIONES: Readonly<Record<SituacionPaso, string>> = {
  hecho: "hecho",
  actual: "en curso",
  pendiente: "pendiente",
  omitido: "no alcanzado",
}

/** En móvil los pasos van en filas de cuatro: el conector no salta de fila. */
const PASOS_POR_FILA = 4

function Paso({
  paso,
  indice,
  ultimo,
}: {
  paso: PasoProgreso
  indice: number
  ultimo: boolean
}) {
  return (
    <li
      aria-current={paso.situacion === "actual" ? "step" : undefined}
      className="relative flex min-w-0 flex-1 flex-col items-center gap-2 text-center"
    >
      {ultimo ? null : (
        <span
          aria-hidden
          className={cn(
            "absolute top-3.5 left-[calc(50%+1rem)] h-0.5 w-[calc(100%-2rem)] rounded-full",
            indice % PASOS_POR_FILA === PASOS_POR_FILA - 1 && "max-sm:hidden",
            paso.situacion === "hecho" ? "bg-primary" : "bg-border",
            paso.situacion === "omitido" &&
              "bg-[repeating-linear-gradient(90deg,var(--border)_0_4px,transparent_4px_8px)]"
          )}
        />
      )}
      <span
        className={cn(
          "relative grid size-7 place-items-center rounded-full text-xs font-semibold",
          paso.situacion === "hecho" && "bg-primary text-primary-foreground",
          paso.situacion === "actual" &&
            "bg-card text-primary ring-2 ring-primary ring-offset-2 ring-offset-card",
          paso.situacion === "pendiente" &&
            "border border-border bg-card text-muted-foreground",
          paso.situacion === "omitido" &&
            "border border-dashed bg-transparent text-muted-foreground/60"
        )}
      >
        {paso.situacion === "hecho" ? (
          <Check aria-hidden className="size-3.5" />
        ) : paso.situacion === "actual" ? (
          <span
            aria-hidden
            className="size-2 rounded-full bg-primary motion-safe:animate-pulse"
          />
        ) : null}
      </span>
      <span className="flex flex-col gap-0.5">
        <span
          className={cn(
            "text-xs font-medium",
            paso.situacion === "pendiente" || paso.situacion === "omitido"
              ? "text-muted-foreground"
              : "text-foreground"
          )}
        >
          {paso.etiqueta}
          <span className="sr-only"> ({SITUACIONES[paso.situacion]})</span>
        </span>
        {paso.at ? (
          <time
            dateTime={paso.at}
            title={formatearFechaHora(paso.at)}
            className="text-[0.6875rem] cifras text-muted-foreground"
          >
            {formatearDiaMes(paso.at)}
          </time>
        ) : null}
      </span>
    </li>
  )
}

/**
 * Avance de la asignación por el camino feliz (aceptada → pagada) y, si se
 * salió de él, su desenlace (rechazada, vencida, cancelada o en disputa).
 */
export function ProgresoAsignacion({ progreso }: { progreso: Progreso }) {
  const { desenlace } = progreso
  return (
    <section
      aria-label="Avance de la asignación"
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5"
    >
      <ol className="grid grid-cols-4 items-start gap-y-4 sm:flex">
        {progreso.pasos.map((paso, indice) => (
          <Paso
            key={paso.estado}
            paso={paso}
            indice={indice}
            ultimo={indice === progreso.pasos.length - 1}
          />
        ))}
      </ol>
      {desenlace ? (
        <p
          className={cn(
            "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-3 py-2 text-sm",
            CLASES_TONO[desenlace.tono].insignia
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              CLASES_TONO[desenlace.tono].punto
            )}
          />
          <span className="font-medium">{desenlace.etiqueta}</span>
          {desenlace.at ? (
            <span className="text-xs" suppressHydrationWarning>
              · {formatearFechaHora(desenlace.at)} (
              {formatearRelativo(desenlace.at)})
            </span>
          ) : null}
        </p>
      ) : null}
    </section>
  )
}
