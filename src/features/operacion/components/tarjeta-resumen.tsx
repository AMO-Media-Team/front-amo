import type { LucideIcon } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import type { ReactNode } from "react"

import {
  type FormatoNumero,
  NumeroAnimado,
} from "@/components/motion/numero-animado"
import {
  formatearCOP,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import type { Tono } from "../estados"

const TONOS_ICONO: Readonly<Record<Tono, string>> = {
  exito: "bg-success/10 text-success",
  info: "bg-info/10 text-info",
  aviso: "bg-warning/12 text-warning",
  peligro: "bg-destructive/10 text-destructive",
  neutro: "bg-primary/10 text-primary",
}

/** Texto completo de la cifra (lectores de pantalla y tooltip). */
function textoCompleto(
  valor: number,
  formato: FormatoNumero,
  decimales: number
): string {
  if (formato === "cop" || formato === "copCompacto") return formatearCOP(valor)
  if (formato === "porcentaje") return formatearPorcentaje(valor, decimales)
  return formatearNumero(valor, decimales)
}

export interface TarjetaResumenProps {
  titulo: string
  /** `null` = sin dato (p. ej. muestra insuficiente): se pinta "—". */
  valor: number | null
  formato?: FormatoNumero
  /** Decimales de la cifra (por defecto 1 en porcentajes y 0 en el resto). */
  decimales?: number
  icono: LucideIcon
  tono?: Tono
  /** Línea de apoyo bajo la cifra. */
  detalle?: ReactNode
  /** Toda la tarjeta enlaza (p. ej. al listado filtrado). */
  href?: Route
  /** Posición en la rejilla: escalona la entrada. */
  indice?: number
  /** Resalta la tarjeta (hay algo que atender). */
  alerta?: boolean
  className?: string
  /** Contenido extra al pie (barra de progreso, desglose). */
  children?: ReactNode
}

/**
 * Indicador de un listado o una ficha de operación: cifra animada, ícono con
 * tono, línea de apoyo y, opcionalmente, un desglose o una barra. Sus tres
 * filas (título, cifra y pie) comparten las de la rejilla (`subgrid`): las
 * cifras de una misma fila quedan alineadas aunque un título ocupe dos líneas.
 */
export function TarjetaResumen({
  titulo,
  valor,
  formato = "numero",
  decimales = formato === "porcentaje" ? 1 : 0,
  icono: Icono,
  tono = "neutro",
  detalle,
  href,
  indice = 0,
  alerta = false,
  className,
  children,
}: TarjetaResumenProps) {
  const sinValor = valor === null || !Number.isFinite(valor)
  return (
    <article
      style={{ animationDelay: `${indice * 55}ms` }}
      className={cn(
        "group/resumen relative row-span-3 grid min-w-0 animate-aparecer-arriba grid-rows-subgrid gap-y-2 rounded-xl border bg-card p-3.5 motion-reduce:animate-none sm:p-4",
        href &&
          "transition-[border-color,box-shadow,translate] duration-300 ease-suave hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-glow has-[a:focus-visible]:anillo-foco motion-reduce:hover:translate-y-0",
        alerta &&
          "border-warning/45 bg-[linear-gradient(160deg,color-mix(in_oklab,var(--warning)_9%,var(--card))_0%,var(--card)_60%)]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="line-clamp-2 min-w-0 text-[0.8125rem] leading-5 font-medium text-pretty text-muted-foreground">
          {href ? (
            <Link
              href={href}
              // El anillo de foco lo pinta la tarjeta completa (`has-[a:focus-visible]`).
              className="outline-none after:absolute after:inset-0 after:rounded-xl"
            >
              {titulo}
            </Link>
          ) : (
            titulo
          )}
        </h2>
        <span
          className={cn(
            "hidden size-7 shrink-0 place-items-center rounded-lg sm:grid sm:size-8",
            TONOS_ICONO[tono]
          )}
        >
          <Icono className="size-4" aria-hidden />
        </span>
      </div>
      {sinValor ? (
        <p className="self-end font-heading text-2xl leading-none font-semibold tracking-tight text-muted-foreground/60 sm:text-[1.75rem]">
          —
        </p>
      ) : (
        <p
          className="self-end font-heading text-2xl leading-none font-semibold tracking-tight sm:text-[1.75rem]"
          title={textoCompleto(valor, formato, decimales)}
        >
          <NumeroAnimado
            valor={valor}
            formato={formato}
            decimales={decimales}
          />
          <span className="sr-only">
            {" "}
            ({textoCompleto(valor, formato, decimales)})
          </span>
        </p>
      )}
      <div className="flex min-w-0 flex-col gap-2">
        {detalle ? (
          <p className="line-clamp-2 text-xs text-pretty text-muted-foreground">
            {detalle}
          </p>
        ) : null}
        {children ? <div className="mt-auto pt-1">{children}</div> : null}
      </div>
    </article>
  )
}

const COLUMNAS = {
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-3 xl:grid-cols-5",
  6: "lg:grid-cols-3 xl:grid-cols-6",
} as const

/** Rejilla de indicadores: dos columnas en móvil, tres en tableta, 3–6 en escritorio. */
export function RejillaResumen({
  etiqueta,
  columnas = 4,
  className,
  children,
}: {
  etiqueta: string
  columnas?: keyof typeof COLUMNAS
  className?: string
  children: ReactNode
}) {
  return (
    <section
      aria-label={etiqueta}
      className={cn(
        "grid grid-cols-2 gap-3 *:min-w-0 md:grid-cols-3",
        // Con un número impar, la última no queda sola en media fila en móvil.
        "max-md:[&>*:last-child:nth-child(odd)]:col-span-2",
        COLUMNAS[columnas],
        className
      )}
    >
      {children}
    </section>
  )
}

/** Clases de rejilla equivalentes para los esqueletos (`EsqueletoKpis`). */
export const CLASES_REJILLA: Readonly<Record<keyof typeof COLUMNAS, string>> = {
  3: "grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3",
  4: "grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
  5: "grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-5",
  6: "grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6",
}
