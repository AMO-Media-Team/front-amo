"use client"

import { Inbox, type LucideIcon, Mail, MailOpen, Shapes } from "lucide-react"
import * as m from "motion/react-m"
import { type ReactNode, useId } from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

import type { EstadoFiltro } from "../esquemas"
import { useConteoNoLeidas } from "../fuente"
import {
  CATEGORIAS,
  CLAVES_CATEGORIA,
  type ClaveCategoria,
} from "../presentacion"
import type { ConteoNoLeidas } from "../tipos"
import { ESTILOS_CATEGORIA } from "./icono-notificacion"
import { useBandeja } from "./marco-bandeja"

interface OpcionEstado {
  valor: EstadoFiltro
  etiqueta: string
  icono: LucideIcon
}

const OPCIONES_ESTADO: readonly OpcionEstado[] = [
  { valor: "todas", etiqueta: "Todas", icono: Inbox },
  { valor: "no_leidas", etiqueta: "No leídas", icono: Mail },
  { valor: "leidas", etiqueta: "Leídas", icono: MailOpen },
]

const TODAS_LAS_CATEGORIAS = "todas"

const ITEMS_CATEGORIA = [
  { value: TODAS_LAS_CATEGORIAS, label: "Todos los tipos" },
  ...CLAVES_CATEGORIA.map((clave) => ({
    value: clave,
    label: CATEGORIAS[clave].etiqueta,
  })),
]

function Cifra({
  valor,
  activa,
  enLinea = false,
}: {
  valor: number
  activa: boolean
  /** Junto a la etiqueta (control segmentado) en lugar de al final de la fila. */
  enLinea?: boolean
}) {
  return (
    <span
      className={cn(
        !enLinea && "ml-auto",
        "relative rounded-full px-1.5 text-[0.6875rem] leading-4 font-semibold cifras",
        activa
          ? "bg-primary/15 text-lila-700 dark:text-primary"
          : "bg-foreground/[0.06] text-muted-foreground"
      )}
    >
      {valor > 99 ? "99+" : valor}
    </span>
  )
}

// ── Móvil y tableta: control segmentado + selector de tipo ───────────────────

function ControlEstado({ noLeidas }: { noLeidas: number }) {
  const { filtros, fijarFiltros } = useBandeja()
  const idIndicador = useId()
  return (
    <div
      role="group"
      aria-label="Estado de lectura"
      className="flex h-9 w-full items-center gap-0.5 rounded-xl bg-muted p-1 sm:inline-flex sm:w-auto"
    >
      {OPCIONES_ESTADO.map((opcion) => {
        const activa = filtros.estado === opcion.valor
        return (
          <button
            key={opcion.valor}
            type="button"
            aria-pressed={activa}
            onClick={() => fijarFiltros({ estado: opcion.valor })}
            className={cn(
              "relative inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[0.8125rem] font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
              activa && "text-foreground"
            )}
          >
            {activa ? (
              <m.span
                layoutId={idIndicador}
                aria-hidden
                transition={{ type: "spring", bounce: 0.18, duration: 0.4 }}
                className="absolute inset-0 rounded-lg bg-background shadow-sm ring-1 ring-foreground/5 dark:bg-input/60"
              />
            ) : null}
            <span className="relative">{opcion.etiqueta}</span>
            {opcion.valor === "no_leidas" && noLeidas > 0 ? (
              <Cifra valor={noLeidas} activa={activa} enLinea />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

function SelectorCategoria({ className }: { className?: string }) {
  const { filtros, fijarFiltros } = useBandeja()
  return (
    <Select
      value={filtros.categoria ?? TODAS_LAS_CATEGORIAS}
      onValueChange={(valor) =>
        fijarFiltros({
          categoria:
            valor && valor !== TODAS_LAS_CATEGORIAS
              ? (valor as ClaveCategoria)
              : null,
        })
      }
      items={ITEMS_CATEGORIA}
    >
      <SelectTrigger
        aria-label="Tipo de notificación"
        className={cn("h-9 rounded-xl", className)}
      >
        <Shapes aria-hidden className="text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" alignItemWithTrigger={false}>
        {ITEMS_CATEGORIA.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Barra de filtros compacta (bajo `lg`); en escritorio la reemplaza el riel. */
export function BarraFiltros({
  inicial,
  className,
}: {
  inicial: ConteoNoLeidas
  className?: string
}) {
  const conteo = useConteoNoLeidas(inicial)
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2",
        className
      )}
    >
      <ControlEstado noLeidas={(conteo.data ?? inicial).total} />
      <SelectorCategoria className="w-full sm:w-56" />
    </div>
  )
}

// ── Escritorio: riel lateral ─────────────────────────────────────────────────

function OpcionRiel({
  activa,
  onElegir,
  icono: Icono,
  claseIcono,
  children,
  cifra,
}: {
  activa: boolean
  onElegir: () => void
  icono: LucideIcon
  claseIcono?: string
  children: string
  cifra?: number
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={activa}
        onClick={onElegir}
        className={cn(
          "relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors outline-none focus-visible:anillo-foco",
          activa
            ? "bg-card font-medium text-foreground shadow-xs ring-1 ring-border"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        )}
      >
        <span
          aria-hidden
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-lg transition-colors",
            activa
              ? (claseIcono ?? "bg-primary/12 text-primary")
              : "bg-muted/70"
          )}
        >
          <Icono className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate">{children}</span>
        {cifra ? <Cifra valor={cifra} activa={activa} /> : null}
      </button>
    </li>
  )
}

function GrupoRiel({
  titulo,
  children,
}: {
  titulo: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <h2
        id={id}
        className="px-2.5 text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
      >
        {titulo}
      </h2>
      <ul aria-labelledby={id} className="flex flex-col gap-0.5">
        {children}
      </ul>
    </div>
  )
}

/** Filtros de la bandeja como riel lateral fijo (solo `lg` en adelante). */
export function RielFiltros({ inicial }: { inicial: ConteoNoLeidas }) {
  const { filtros, fijarFiltros } = useBandeja()
  const conteo = useConteoNoLeidas(inicial)
  const noLeidas = (conteo.data ?? inicial).total

  return (
    <nav
      aria-label="Filtros de notificaciones"
      className="hidden flex-col gap-6 lg:sticky lg:top-20 lg:flex lg:self-start"
    >
      <GrupoRiel titulo="Bandeja">
        {OPCIONES_ESTADO.map((opcion) => (
          <OpcionRiel
            key={opcion.valor}
            activa={filtros.estado === opcion.valor}
            onElegir={() => fijarFiltros({ estado: opcion.valor })}
            icono={opcion.icono}
            cifra={opcion.valor === "no_leidas" ? noLeidas : undefined}
          >
            {opcion.etiqueta}
          </OpcionRiel>
        ))}
      </GrupoRiel>
      <GrupoRiel titulo="Tipo">
        <OpcionRiel
          activa={filtros.categoria === null}
          onElegir={() => fijarFiltros({ categoria: null })}
          icono={Shapes}
        >
          Todos los tipos
        </OpcionRiel>
        {CLAVES_CATEGORIA.map((clave) => (
          <OpcionRiel
            key={clave}
            activa={filtros.categoria === clave}
            onElegir={() => fijarFiltros({ categoria: clave })}
            icono={ESTILOS_CATEGORIA[clave].icono}
            claseIcono={ESTILOS_CATEGORIA[clave].clase}
          >
            {CATEGORIAS[clave].etiqueta}
          </OpcionRiel>
        ))}
      </GrupoRiel>
    </nav>
  )
}
