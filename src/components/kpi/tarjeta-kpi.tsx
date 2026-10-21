"use client"

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Info,
  type LucideIcon,
  Sparkles,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"

import { Sparkline } from "@/components/charts/sparkline"
import { Esqueleto } from "@/components/feedback/esqueletos"
import { NumeroAnimado } from "@/components/motion/numero-animado"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import type { DefinicionKpi } from "./definiciones-kpi"
import { presentarDelta, type TonoDelta } from "./delta"
import { formatearValorKpi, formatoCifraKpi } from "./formato-kpi"
import type { SentidoKpi, UnidadKpi } from "./tipos"

export interface TarjetaKpiProps {
  titulo: string
  valor: number | null
  unidad?: UnidadKpi
  valorAnterior?: number | null
  variacion?: number | null
  sentido?: SentidoKpi
  serie?: readonly (number | null)[] | null
  /** Tamaño de la muestra y mínimo para comparar (tasas agregadas). */
  n?: number | null
  nMinimo?: number
  /** Definición del KPI (docs/kpis.md) que se abre desde el ícono de ayuda. */
  definicion?: DefinicionKpi
  icono?: LucideIcon
  /** Toda la tarjeta enlaza al detalle (reporte o sección). */
  href?: Route
  etiquetaComparacion?: string
  /**
   * El indicador no se compara con otro periodo (una foto de hoy, un total a
   * la fecha): en lugar de la variación se muestra este rótulo, que dice por
   * qué («Foto de hoy»). Se ignoran `valorAnterior` y `variacion`.
   */
  sinComparativo?: string
  /**
   * Texto cuando no hay valor. Un indicador a fecha de corte no tiene
   * «periodo»: quien lo usa dice qué falta («Sin saldo a la fecha de corte»).
   */
  textoSinDatos?: string
  cargando?: boolean
  /** Posición en la rejilla: escalona la entrada. */
  indice?: number
  className?: string
}

const TONOS: Readonly<Record<TonoDelta, string>> = {
  positivo: "bg-success/10 text-success",
  negativo: "bg-destructive/10 text-destructive",
  neutro: "bg-muted text-muted-foreground",
}

function IconoTendencia({
  tipo,
  tendencia,
}: {
  tipo: string
  tendencia: string
}) {
  if (tipo === "nuevo") return <Sparkles aria-hidden className="size-3" />
  if (tendencia === "sube")
    return <ArrowUpRight aria-hidden className="size-3.5" />
  if (tendencia === "baja")
    return <ArrowDownRight aria-hidden className="size-3.5" />
  return <ArrowRight aria-hidden className="size-3.5" />
}

function AyudaKpi({
  definicion,
  nMinimo,
}: {
  definicion: DefinicionKpi
  nMinimo?: number
}) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={250}
        aria-label={`Qué es ${definicion.nombre}`}
        className="relative z-10 -m-0.5 grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:anillo-foco"
      >
        <Info aria-hidden className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-80 gap-2 p-3.5 text-[0.8125rem]"
      >
        <p className="font-heading font-semibold">{definicion.nombre}</p>
        <p className="text-muted-foreground">{definicion.definicion}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t pt-2 text-xs">
          <dt className="text-muted-foreground">Cálculo</dt>
          <dd>{definicion.calculo}</dd>
          <dt className="text-muted-foreground">Fecha</dt>
          <dd>{definicion.ancla}</dd>
          {definicion.exigeMuestra && nMinimo ? (
            <>
              <dt className="text-muted-foreground">Muestra</dt>
              <dd>Se compara con al menos {formatearNumero(nMinimo)} casos.</dd>
            </>
          ) : null}
        </dl>
        {definicion.nota ? (
          <p className="text-xs text-muted-foreground">{definicion.nota}</p>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function EsqueletoContenido() {
  return (
    <>
      <div className="flex items-center justify-between">
        <Esqueleto className="h-3.5 w-24" />
        <Esqueleto className="size-7 rounded-lg" />
      </div>
      <Esqueleto className="h-7 w-32" />
      <div className="flex items-end justify-between gap-3">
        <Esqueleto className="h-5 w-16" />
        {/* Mismo ancho que la sparkline real (más angosta en móvil). */}
        <Esqueleto className="h-8 w-14 sm:w-20" />
      </div>
    </>
  )
}

/**
 * Tarjeta de indicador: cifra animada (NumberFlow), variación frente al
 * periodo anterior con color según el sentido del KPI (o el rótulo de por qué
 * no se compara), sparkline y definición a un toque. Estados: cargando, sin
 * datos y muestra insuficiente (n < mínimo).
 */
export function TarjetaKpi({
  titulo,
  valor,
  unidad = "conteo",
  valorAnterior,
  variacion,
  sentido = "mayor",
  serie,
  n,
  nMinimo,
  definicion,
  icono: Icono,
  href,
  etiquetaComparacion = "vs. periodo anterior",
  sinComparativo,
  textoSinDatos = "Sin datos en el periodo",
  cargando = false,
  indice = 0,
  className,
}: TarjetaKpiProps) {
  const clases = cn(
    "group/kpi relative flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-3.5 sm:p-4",
    "animate-aparecer-arriba motion-reduce:animate-none",
    // El enlace cubre toda la tarjeta: su foco de teclado se dibuja en ella
    // con el anillo de marca (un simple cambio de borde no se distinguía).
    href &&
      "transition-[border-color,box-shadow,translate] duration-300 ease-suave hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-glow has-[a:focus-visible]:border-primary has-[a:focus-visible]:anillo-foco motion-reduce:hover:translate-y-0",
    className
  )
  const estilo = { animationDelay: `${indice * 55}ms` }

  if (cargando) {
    return (
      <div role="status" aria-busy="true" className={clases} style={estilo}>
        <span className="sr-only">Cargando {titulo}…</span>
        <EsqueletoContenido />
      </div>
    )
  }

  const muestraInsuficiente = n != null && nMinimo != null && n < nMinimo
  const sinValor = valor === null || !Number.isFinite(valor)
  const delta =
    sinValor || sinComparativo
      ? null
      : presentarDelta({ valor, valorAnterior, variacion, unidad, sentido })
  const formato = sinValor ? null : formatoCifraKpi(unidad, valor)
  const tieneSerie = (serie?.filter((v) => v !== null).length ?? 0) > 1

  return (
    <article className={clases} style={estilo}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1 max-sm:min-h-10">
          <h3 className="line-clamp-2 min-w-0 text-[0.8125rem] leading-5 font-medium text-pretty text-muted-foreground">
            {href ? (
              <Link
                href={href}
                className="outline-none after:absolute after:inset-0 after:rounded-xl"
              >
                {titulo}
              </Link>
            ) : (
              titulo
            )}
          </h3>
          {definicion ? (
            <AyudaKpi definicion={definicion} nMinimo={nMinimo} />
          ) : null}
        </div>
        {Icono ? (
          // Decorativo: en móvil cede su espacio al nombre del indicador.
          <span className="hidden size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary transition-colors group-hover/kpi:bg-primary/15 sm:grid">
            <Icono aria-hidden className="size-3.5" />
          </span>
        ) : null}
      </div>

      {sinValor || !formato ? (
        <p className="font-heading text-2xl leading-none font-semibold tracking-tight text-muted-foreground/60 sm:text-[1.75rem]">
          —
        </p>
      ) : (
        <p
          className="font-heading text-2xl leading-none font-semibold tracking-tight sm:text-[1.75rem]"
          title={formatearValorKpi(valor, unidad)}
        >
          <NumeroAnimado
            valor={valor}
            formato={formato.formato}
            decimales={formato.decimales}
            sufijo={formato.sufijo}
          />
          <span className="sr-only"> ({formatearValorKpi(valor, unidad)})</span>
        </p>
      )}

      <div className="mt-auto flex min-h-8 items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col items-start gap-1">
          {sinValor ? (
            <p className="text-xs text-muted-foreground">
              {muestraInsuficiente ? (
                <>
                  <span className="block font-medium text-foreground">
                    Muestra insuficiente
                  </span>
                  <span className="cifras">
                    n = {formatearNumero(n)} · se necesitan{" "}
                    {formatearNumero(nMinimo)}
                  </span>
                </>
              ) : (
                textoSinDatos
              )}
            </p>
          ) : sinComparativo ? (
            <p className="line-clamp-2 max-w-full text-[0.6875rem] leading-tight text-pretty text-muted-foreground">
              {muestraInsuficiente
                ? `${sinComparativo} · n = ${formatearNumero(n)}`
                : sinComparativo}
            </p>
          ) : delta ? (
            <>
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold cifras whitespace-nowrap",
                  // Con muestra pequeña la variación se informa sin juzgarla
                  // (docs/kpis.md §0.4): comparar grupos chicos engaña.
                  TONOS[muestraInsuficiente ? "neutro" : delta.tono]
                )}
              >
                <IconoTendencia tipo={delta.tipo} tendencia={delta.tendencia} />
                <span aria-hidden>{delta.texto}</span>
                <span className="sr-only">{delta.descripcion}</span>
              </span>
              <span className="line-clamp-2 max-w-full text-[0.6875rem] leading-tight text-pretty text-muted-foreground">
                {muestraInsuficiente
                  ? `n = ${formatearNumero(n)} · muestra pequeña`
                  : etiquetaComparacion}
              </span>
            </>
          ) : null}
        </div>
        {tieneSerie && serie ? (
          <Sparkline
            valores={serie}
            ancho={80}
            alto={30}
            className="w-14 sm:w-20"
          />
        ) : null}
      </div>
    </article>
  )
}
