"use client"

import {
  Building2,
  Flag,
  Lock,
  type LucideIcon,
  MessagesSquare,
  RadioTower,
  ShieldCheck,
} from "lucide-react"
import { useId } from "react"

import { formatearFechaHoraFija } from "@/features/operacion/formato"
import { cn } from "@/lib/utils"

import {
  autorDeMensaje,
  ETIQUETAS_PARTE,
  estaAbierta,
  laAbrioQuienMira,
  MOTIVOS,
  nombreParte,
} from "../presentacion"
import type {
  DisputaDetalle,
  MensajeDisputa,
  ParteDisputa,
  Perspectiva,
} from "../tipos"
import { AdjuntoMensaje } from "./adjunto-mensaje"
import { CajaRespuesta } from "./caja-respuesta"

const ICONOS_PARTE: Readonly<Record<ParteDisputa, LucideIcon>> = {
  MEDIO: RadioTower,
  ANUNCIANTE: Building2,
  ADMIN: ShieldCheck,
}

const TINTE_PARTE: Readonly<Record<ParteDisputa, string>> = {
  MEDIO: "bg-info/12 text-info",
  ANUNCIANTE: "bg-primary/12 text-lila-700 dark:text-primary",
  ADMIN: "bg-success/12 text-success",
}

function AvatarParte({ parte }: { parte: ParteDisputa }) {
  const Icono = ICONOS_PARTE[parte]
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full",
        TINTE_PARTE[parte]
      )}
    >
      <Icono className="size-4" />
    </span>
  )
}

function Hora({ instante, id }: { instante: string; id?: string }) {
  return (
    <time
      id={id}
      dateTime={instante}
      className="text-xs cifras whitespace-nowrap text-muted-foreground"
    >
      {formatearFechaHoraFija(instante)}
    </time>
  )
}

/** Primera entrada del hilo: quién abrió la disputa, por qué y qué contó. */
function Apertura({
  disputa,
  perspectiva,
  autor,
}: {
  disputa: Pick<DisputaDetalle, "parte" | "motivo" | "descripcion" | "creadaAt">
  perspectiva: Perspectiva
  autor?: string
}) {
  const propia = laAbrioQuienMira(disputa.parte, perspectiva)
  const nombre = propia
    ? perspectiva === "medio"
      ? "Tú"
      : "Tu empresa"
    : (autor ?? ETIQUETAS_PARTE[disputa.parte])
  return (
    <article className="flex gap-3">
      <AvatarParte parte={disputa.parte} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-xl border bg-muted/30 px-3.5 py-2.5">
        <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{nombre}</span>
            <span className="text-xs text-muted-foreground">
              abrió la disputa
            </span>
          </span>
          <Hora instante={disputa.creadaAt} />
        </header>
        <p className="flex items-center gap-1.5 text-xs font-medium text-foreground/80">
          <Flag aria-hidden className="size-3.5 text-muted-foreground" />
          Motivo: {MOTIVOS[disputa.motivo].etiqueta}
        </p>
        <p className="text-sm text-pretty break-words whitespace-pre-line">
          {disputa.descripcion}
        </p>
      </div>
    </article>
  )
}

function Mensaje({
  disputaId,
  mensaje,
  perspectiva,
}: {
  disputaId: string
  mensaje: MensajeDisputa
  perspectiva: Perspectiva
}) {
  const id = useId()
  const idAutor = `${id}-autor`
  const idHora = `${id}-hora`
  const autor = autorDeMensaje(mensaje, perspectiva)
  return (
    <article
      aria-labelledby={idAutor}
      aria-describedby={idHora}
      className="flex gap-3"
    >
      <AvatarParte parte={mensaje.autorParte} />
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-1.5 rounded-xl border px-3.5 py-2.5",
          mensaje.interno
            ? "border-dashed border-warning/60 bg-warning/6"
            : mensaje.esMio
              ? "border-primary/30 bg-primary/5"
              : "bg-card"
        )}
      >
        <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span id={idAutor} className="font-medium break-words">
              {autor.nombre}
            </span>
            {autor.detalle ? (
              <span className="text-xs text-muted-foreground">
                {autor.detalle}
              </span>
            ) : null}
          </span>
          <Hora instante={mensaje.creadoAt} id={idHora} />
        </header>
        {mensaje.interno ? (
          <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
            <Lock aria-hidden className="size-3.5" />
            Nota interna · Solo la ve el equipo AMO
          </p>
        ) : null}
        <p className="text-sm text-pretty break-words whitespace-pre-line">
          {mensaje.mensaje}
        </p>
        {mensaje.adjunto ? (
          <AdjuntoMensaje
            disputaId={disputaId}
            mensajeId={mensaje.id}
            adjunto={mensaje.adjunto}
            describidoPor={`${idAutor} ${idHora}`}
          />
        ) : null}
      </div>
    </article>
  )
}

export interface HiloDisputaProps {
  disputa: Pick<
    DisputaDetalle,
    | "id"
    | "estado"
    | "parte"
    | "motivo"
    | "descripcion"
    | "creadaAt"
    | "resueltaAt"
  >
  /** De `mensajesDeDisputa` (las partes ya no reciben las notas internas). */
  mensajes: readonly MensajeDisputa[]
  perspectiva: Perspectiva
  /**
   * La sesión puede escribir: una parte con `disputas.abrir` o el equipo con
   * `disputas.resolver`. Si la disputa está cerrada, el hilo lo explica y
   * solo el equipo sigue dejando notas internas.
   */
  puedeEscribir: boolean
  /** `disputas.resolver`: notas internas (solo para la perspectiva interna). */
  puedeNotaInterna?: boolean
  /** Nombre de quien la abrió (el medio o la empresa); por defecto, su parte. */
  autorApertura?: string
  className?: string
}

/**
 * Hilo de una disputa (ADM-012): quién la abrió y por qué, los mensajes de
 * las partes y del equipo en orden, con sus adjuntos (firmados al abrirlos) y
 * las notas internas resaltadas («Solo la ve el equipo AMO»), y la caja para
 * responder con lo que verá cada quien. Sirve para el equipo, el medio y el
 * anunciante (`perspectiva`).
 */
export function HiloDisputa({
  disputa,
  mensajes,
  perspectiva,
  puedeEscribir,
  puedeNotaInterna = false,
  autorApertura,
  className,
}: HiloDisputaProps) {
  const idTitulo = useId()
  const abierta = estaAbierta(disputa.estado)
  const notas = perspectiva === "interno" && puedeNotaInterna
  const modo = !puedeEscribir
    ? null
    : abierta
      ? "completo"
      : notas
        ? "notas"
        : null
  const total = mensajes.length
  const otra =
    perspectiva === "interno"
      ? "las partes"
      : nombreParte(
          perspectiva === "medio" ? "ANUNCIANTE" : "MEDIO",
          perspectiva
        )

  return (
    <section
      aria-labelledby={idTitulo}
      className={cn("flex flex-col rounded-xl border bg-card", className)}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <MessagesSquare className="size-4" aria-hidden />
          </span>
          <h2 id={idTitulo} className="text-[0.9375rem] font-semibold">
            Conversación
          </h2>
        </div>
        <span className="text-xs cifras text-muted-foreground">
          {total === 0
            ? "Sin mensajes"
            : total === 1
              ? "1 mensaje"
              : `${total.toLocaleString("es-CO")} mensajes`}
        </span>
      </header>

      <ol
        aria-label="Mensajes de la disputa"
        className="flex flex-col gap-4 px-4 py-4 sm:px-5"
      >
        <li>
          <Apertura
            disputa={disputa}
            perspectiva={perspectiva}
            autor={autorApertura}
          />
        </li>
        {mensajes.map((mensaje) => (
          <li key={mensaje.id}>
            <Mensaje
              disputaId={disputa.id}
              mensaje={mensaje}
              perspectiva={perspectiva}
            />
          </li>
        ))}
      </ol>
      {total === 0 && abierta ? (
        <p className="px-4 pb-4 text-sm text-pretty text-muted-foreground sm:px-5">
          Aún no hay mensajes.{" "}
          {modo
            ? `Escribe para dar contexto o aportar pruebas: ${otra} y el equipo lo verán aquí.`
            : ""}
        </p>
      ) : null}

      <div className="border-t px-4 py-4 sm:px-5">
        {modo ? (
          <div className="flex flex-col gap-3">
            {modo === "notas" ? (
              <p className="text-sm text-pretty text-muted-foreground">
                La disputa está cerrada: las partes ya no escriben. Puedes dejar
                notas internas para el equipo.
              </p>
            ) : null}
            <CajaRespuesta
              disputaId={disputa.id}
              perspectiva={perspectiva}
              puedeNotaInterna={notas}
              soloNotas={modo === "notas"}
            />
          </div>
        ) : (
          <p className="text-sm text-pretty text-muted-foreground">
            {abierta
              ? "Consulta en solo lectura: responder es de las partes y del equipo que resuelve disputas."
              : disputa.resueltaAt
                ? `La disputa se cerró el ${formatearFechaHoraFija(disputa.resueltaAt)}: ya no admite mensajes.`
                : "La disputa se cerró: ya no admite mensajes."}
          </p>
        )}
      </div>
    </section>
  )
}
