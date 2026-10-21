"use client"

import { MapPinOff } from "lucide-react"
import * as m from "motion/react-m"
import { type ReactNode, useId } from "react"

import { EASE_SUAVE } from "@/components/motion/aparecer"
import { formatearNumero, formatearPorcentaje } from "@/lib/format"
import { cn } from "@/lib/utils"

import type { ElementoRanking } from "../tipos"
import { Bandera } from "./distintivos"

const CLAVE_OTROS = "__otros__"

function FilaRanking({
  elemento,
  puesto,
  maximo,
}: {
  elemento: ElementoRanking
  puesto: number
  /** Cantidad del primero: la barra más larga ocupa todo el ancho. */
  maximo: number
}) {
  const esOtros = elemento.clave === CLAVE_OTROS
  const ancho = maximo > 0 ? elemento.cantidad / maximo : 0
  return (
    <li className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
      {esOtros ? (
        <span
          aria-hidden
          className="grid h-5 w-6 place-items-center text-xs text-muted-foreground"
        >
          ···
        </span>
      ) : (
        <Bandera bandera={elemento.bandera} iso2={elemento.iso2} />
      )}
      <span className="flex min-w-0 items-baseline gap-2 text-sm">
        <span
          className={cn(
            "truncate font-medium",
            esOtros && "text-muted-foreground"
          )}
        >
          {elemento.etiqueta}
        </span>
        {elemento.detalle ? (
          <span className="truncate text-xs text-muted-foreground">
            {elemento.detalle}
          </span>
        ) : null}
      </span>
      <span className="text-right text-sm cifras">
        <span className="font-semibold">
          {formatearNumero(elemento.cantidad)}
        </span>
        <span className="ml-1.5 inline-block w-11 text-xs text-muted-foreground">
          {formatearPorcentaje(
            elemento.proporcion,
            elemento.proporcion < 0.1 ? 1 : 0
          )}
        </span>
      </span>
      <span
        aria-hidden
        className="col-start-2 col-end-4 h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <m.span
          className={cn(
            "block h-full origin-left rounded-full",
            esOtros
              ? "bg-muted-foreground/40"
              : "bg-[linear-gradient(90deg,var(--primary),color-mix(in_oklab,var(--primary)_55%,#5b6cf0))]"
          )}
          style={{ width: `${Math.max(ancho * 100, 1.5)}%` }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{
            duration: 0.7,
            delay: 0.1 + puesto * 0.06,
            ease: EASE_SUAVE,
          }}
        />
      </span>
    </li>
  )
}

interface RankingUbicacionesProps {
  titulo: string
  descripcion: string
  /** Icono ya renderizado (un Server Component no puede pasar el componente). */
  icono: ReactNode
  elementos: readonly ElementoRanking[]
  /** Texto del estado vacío cuando ningún ingreso trae ubicación. */
  vacio: { titulo: string; descripcion: string }
  /** Nota al pie (p. ej. ingresos sin ubicación). */
  nota?: string | null
  className?: string
}

/**
 * Ranking horizontal de países o ciudades: bandera, nombre, cantidad y
 * participación, con barras que crecen al aparecer. Es una lista (no un
 * lienzo): se lee con lector de pantalla y se copia tal cual.
 */
export function RankingUbicaciones({
  titulo,
  descripcion,
  icono,
  elementos,
  vacio,
  nota,
  className,
}: RankingUbicacionesProps) {
  const idTitulo = useId()
  const maximo = elementos.reduce(
    (mayor, e) =>
      e.clave === CLAVE_OTROS ? mayor : Math.max(mayor, e.cantidad),
    0
  )
  return (
    <section
      aria-labelledby={idTitulo}
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 transition-colors duration-300 hover:border-foreground/15 sm:p-5",
        className
      )}
    >
      <header className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary [&_svg]:size-4">
          {icono}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3
            id={idTitulo}
            className="font-heading text-[0.9375rem] leading-snug font-semibold"
          >
            {titulo}
          </h3>
          <p className="text-[0.8125rem] text-muted-foreground">
            {descripcion}
          </p>
        </div>
      </header>
      {elementos.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center">
          <MapPinOff className="size-5 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">{vacio.titulo}</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            {vacio.descripcion}
          </p>
        </div>
      ) : (
        <ol className="flex flex-col gap-3.5" aria-label={titulo}>
          {elementos.map((elemento, puesto) => (
            <FilaRanking
              key={elemento.clave}
              elemento={elemento}
              puesto={puesto}
              maximo={maximo}
            />
          ))}
        </ol>
      )}
      {nota ? (
        <p className="mt-auto text-xs text-muted-foreground">{nota}</p>
      ) : null}
    </section>
  )
}
