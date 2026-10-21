import { ArrowLeft, type LucideIcon } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { type ReactNode, Suspense } from "react"

import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { Esqueleto } from "@/components/feedback/esqueletos"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { TituloMiga } from "@/components/layout/titulo-miga"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  formatearFecha,
  formatearFechaHora,
  formatearRelativo,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import type { Tono } from "../estados"

export {
  ListaDatos,
  SinDato,
  TarjetaFicha,
} from "@/features/usuarios/components/tarjeta-ficha"

/** Identificador de registro en la URL (las fichas validan antes de consultar). */
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface CabeceraFichaProps {
  volver: { href: Route; titulo: string }
  antetitulo: ReactNode
  titulo: string
  subtitulo?: ReactNode
  /** Insignias de estado, nivel, demo… */
  distintivos?: ReactNode
  /** Logo, monograma o avatar a la izquierda del título. */
  visual?: ReactNode
  /** Columna derecha: fechas, enlaces relacionados. */
  lateral?: ReactNode
  /** Aviso de estado bajo la cabecera (suspendido, rechazado…). */
  aviso?: ReactNode
}

/**
 * Cabecera común de las fichas de operación (medio, anunciante, campaña y
 * asignación): regreso al listado, identidad, estado y contexto, sobre el
 * degradado Aurora atenuado de la marca.
 */
export function CabeceraFicha({
  volver,
  antetitulo,
  titulo,
  subtitulo,
  distintivos,
  visual,
  lateral,
  aviso,
}: CabeceraFichaProps) {
  return (
    <div className="flex flex-col gap-4">
      <TituloMiga titulo={titulo} />
      <EnlaceBoton
        variant="ghost"
        size="sm"
        className="-ml-2 w-fit text-muted-foreground"
        href={volver.href}
      >
        <ArrowLeft data-icon="inline-start" aria-hidden />
        {volver.titulo}
      </EnlaceBoton>
      <header className="relative overflow-hidden rounded-2xl border bg-card">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-aurora [mask-image:linear-gradient(to_bottom,black,transparent_85%)] opacity-[0.14] dark:opacity-22"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 patron-puntos opacity-50"
        />
        <div className="relative flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-start gap-4 sm:items-center sm:gap-5">
            {visual}
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-primary uppercase">
                {antetitulo}
              </p>
              <h1 className="text-2xl leading-tight font-bold text-balance break-words sm:text-[1.75rem]">
                {titulo}
              </h1>
              {subtitulo ? (
                <div className="text-sm text-muted-foreground">{subtitulo}</div>
              ) : null}
              {distintivos ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {distintivos}
                </div>
              ) : null}
            </div>
          </div>
          {lateral ? (
            <div className="flex min-w-0 shrink-0 flex-col gap-1.5 text-xs text-muted-foreground lg:items-end lg:text-right">
              {lateral}
            </div>
          ) : null}
        </div>
      </header>
      {aviso}
    </div>
  )
}

const CLASES_AVISO: Readonly<Record<Tono, { alerta: string; icono: string }>> =
  {
    exito: { alerta: "border-success/40 bg-success/8", icono: "text-success" },
    info: { alerta: "border-info/40 bg-info/8", icono: "text-info" },
    aviso: { alerta: "border-warning/40 bg-warning/8", icono: "text-warning" },
    peligro: {
      alerta: "border-destructive/40 bg-destructive/8",
      icono: "text-destructive",
    },
    neutro: { alerta: "", icono: "text-muted-foreground" },
  }

export function AvisoFicha({
  tono,
  icono: Icono,
  titulo,
  children,
}: {
  tono: Tono
  icono: LucideIcon
  titulo: ReactNode
  children?: ReactNode
}) {
  const clases = CLASES_AVISO[tono]
  return (
    <Alert className={clases.alerta}>
      <Icono className={clases.icono} aria-hidden />
      <AlertTitle>{titulo}</AlertTitle>
      {children ? <AlertDescription>{children}</AlertDescription> : null}
    </Alert>
  )
}

/**
 * Enlace a la ficha de otra entidad. Si el rol no tiene el permiso de esa
 * sección queda como texto: no se ofrece un enlace que termina en «sin permiso».
 */
export function EnlaceFicha({
  href,
  permitido,
  className,
  children,
}: {
  href: Route
  permitido: boolean
  className?: string
  children: ReactNode
}) {
  if (!permitido) return <span className={className}>{children}</span>
  return (
    <Link
      href={href}
      className={cn(
        "underline-offset-4 hover:underline focus-visible:underline",
        className
      )}
    >
      {children}
    </Link>
  )
}

/** Fecha larga con la distancia relativa ("12 de sept de 2026 · hace 3 días"). */
export function FechaRelativa({
  valor,
  vacio = "—",
  estilo = "largo",
}: {
  valor: string | null
  vacio?: string
  estilo?: "medio" | "largo"
}) {
  if (!valor) return <span className="text-muted-foreground">{vacio}</span>
  return (
    <time dateTime={valor} title={formatearFechaHora(valor)}>
      {formatearFecha(valor, estilo)}
      <span className="text-muted-foreground" suppressHydrationWarning>
        {" "}
        · {formatearRelativo(valor)}
      </span>
    </time>
  )
}

/** Esqueleto de una sección de ficha mientras llega en streaming. */
export function EsqueletoSeccion({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn("grid gap-4 lg:grid-cols-2", className)}
    >
      <span className="sr-only">Cargando…</span>
      <Esqueleto className="h-56 rounded-xl" />
      <Esqueleto className="h-56 rounded-xl" />
      <Esqueleto className="h-40 rounded-xl lg:col-span-2" />
    </div>
  )
}

/** Sección que consulta: esqueleto mientras carga y error aislado del resto. */
export function Diferida({
  recurso,
  respaldo,
  children,
}: {
  recurso: string
  respaldo?: ReactNode
  children: ReactNode
}) {
  return (
    <LimiteErrorTabla recurso={recurso}>
      <Suspense fallback={respaldo ?? <EsqueletoSeccion />}>
        {children}
      </Suspense>
    </LimiteErrorTabla>
  )
}

/** Monograma de una entidad sin logo (iniciales sobre el tinte de la marca). */
export function Monograma({
  texto,
  icono: Icono,
  className,
}: {
  texto?: string
  icono?: LucideIcon
  className?: string
}) {
  const iniciales = (texto ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => palabra[0]?.toLocaleUpperCase("es-CO"))
    .join("")
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-14 shrink-0 place-items-center rounded-2xl bg-primary/12 font-heading text-lg font-semibold text-lila-700 ring-1 ring-primary/25 sm:size-16 sm:text-xl dark:text-primary",
        className
      )}
    >
      {Icono ? <Icono className="size-6 sm:size-7" /> : iniciales || "·"}
    </span>
  )
}
