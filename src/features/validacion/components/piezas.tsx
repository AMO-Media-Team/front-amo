import { CircleCheck, ExternalLink, RefreshCw, Scale } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { type ReactNode, useId } from "react"

import { EnlaceBotonExterno } from "@/components/layout/enlace-boton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { formatearHandle } from "@/features/operacion/formato"
import { formatearFechaHora, formatearRelativo } from "@/lib/format"
import { cn } from "@/lib/utils"

import { TEXTO_SE_DECIDE_EN_DISPUTA } from "../decision"

/** Un dato corto con su icono (tarjetas de la cola). */
export function Dato({
  icono,
  children,
  className,
}: {
  icono: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5 [&_svg]:shrink-0",
        className
      )}
    >
      {icono}
      {children}
    </span>
  )
}

/** «hace 3 horas» con la fecha exacta al pasar el cursor (puede diferir al hidratar). */
export function Hace({ instante }: { instante: string }) {
  return (
    <time
      dateTime={instante}
      title={formatearFechaHora(instante)}
      suppressHydrationWarning
    >
      {formatearRelativo(instante)}
    </time>
  )
}

export interface FilaDato {
  etiqueta: string
  valor: ReactNode
  /** Texto completo al pasar el cursor (p. ej. la fecha con hora). */
  titulo?: string
  destacado?: boolean
  /** Ocupa las dos columnas. */
  ancho?: boolean
}

/** Lista de datos en dos columnas si caben (una en el celular y en la columna angosta). */
export function ListaDatosRevision({ filas }: { filas: readonly FilaDato[] }) {
  return (
    <div className="@container">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm @sm:grid-cols-2">
        {filas.map((fila) => (
          <div
            key={fila.etiqueta}
            className={cn(
              "flex min-w-0 flex-col gap-0.5",
              fila.ancho && "@sm:col-span-2"
            )}
          >
            <dt className="text-xs text-muted-foreground">{fila.etiqueta}</dt>
            <dd
              title={fila.titulo}
              className={cn(
                "cifras break-words",
                fila.destacado && "font-medium text-warning"
              )}
            >
              {fila.valor}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** «Qué comprobar» antes de decidir. */
export function Comprobaciones({ puntos }: { puntos: readonly string[] }) {
  const idTitulo = useId()
  return (
    <section aria-labelledby={idTitulo} className="flex flex-col gap-2">
      <h3 id={idTitulo} className="text-sm font-semibold">
        Qué comprobar
      </h3>
      <ul className="flex flex-col gap-1.5 text-sm">
        {puntos.map((punto) => (
          <li key={punto} className="flex items-start gap-2 text-pretty">
            <CircleCheck
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-primary"
            />
            {punto}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Medio y cuenta: «Radio Pasto · @radiopasto». */
export function textoMedio(medio: {
  nombre: string
  handle: string | null
}): string {
  return medio.handle
    ? `${medio.nombre} · ${formatearHandle(medio.handle)}`
    : medio.nombre
}

/** «Abrir la publicación» en otra pestaña, con la dirección a la vista. */
export function AbrirPublicacion({
  url,
  className,
}: {
  url: string
  className?: string
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <EnlaceBotonExterno
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        variant="outline"
        size="lg"
        className="w-full sm:w-fit"
      >
        <ExternalLink data-icon="inline-start" aria-hidden />
        Abrir la publicación
        <span className="sr-only"> (abre en una pestaña nueva)</span>
      </EnlaceBotonExterno>
      <span className="truncate text-xs text-muted-foreground" title={url}>
        {url.replace(/^https?:\/\//, "")}
      </span>
    </div>
  )
}

/**
 * Una decisión que espera a la disputa (hint `en_disputa`): en lugar de sus
 * botones, el porqué y el enlace a la disputa (o a la ficha de la asignación,
 * que enlaza a ella).
 */
export function EsperaDisputa({
  detalle,
  enlace,
  className,
}: {
  /** Qué espera y por qué, tras «Se decide al resolver la disputa.». */
  detalle: string
  enlace: { href: Route; etiqueta: string } | null
  className?: string
}) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/8 px-3 py-2 text-xs text-pretty",
        className
      )}
    >
      <Scale aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warning" />
      <p className="flex min-w-0 flex-col gap-1">
        <span>
          <span className="font-medium">{TEXTO_SE_DECIDE_EN_DISPUTA}</span>{" "}
          <span className="text-muted-foreground">{detalle}</span>
        </span>
        {enlace ? (
          <Link
            href={enlace.href}
            className="w-fit font-medium text-primary underline-offset-4 hover:underline focus-visible:underline"
          >
            {enlace.etiqueta}
          </Link>
        ) : null}
      </p>
    </div>
  )
}

/** Sin la versión nueva en esta página de la cola: dónde buscarla. */
export const TEXTO_VERSION_FUERA_DE_PAGINA =
  "Ya no está pendiente en esta página de la cola: puede que otra persona la haya decidido o que, al cambiar, haya pasado a otra página. Vuelve a la cola y búscala allí."

/**
 * El medio cambió lo que se revisaba (hints `evidencia_cambiada` y
 * `metrica_cambiada`): la decisión no se aplicó. Va en lugar del formulario;
 * el pie ofrece revisar la versión nueva si la cola ya la trae
 * (`conVersionNueva`) o volver a la cola.
 */
export function AvisoVersionCambiada({
  mensaje,
  conVersionNueva,
}: {
  mensaje: string
  conVersionNueva: boolean
}) {
  return (
    <Alert className="border-warning/45 bg-warning/10">
      <RefreshCw aria-hidden />
      <AlertTitle>Hay una versión más reciente</AlertTitle>
      <AlertDescription className="flex flex-col gap-1 text-pretty">
        <p>{mensaje}</p>
        {conVersionNueva ? null : <p>{TEXTO_VERSION_FUERA_DE_PAGINA}</p>}
      </AlertDescription>
    </Alert>
  )
}
