import { ArrowUpRight, Download, History, UsersRound } from "lucide-react"
import Link from "next/link"

import { formatearFechaHora, formatearRelativo } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  ETIQUETAS_FILTRO,
  type FiltroReporte,
  type ReporteCatalogo,
  rutaReporte,
} from "../catalogo"
import type { UltimaExportacion } from "../servidor"
import { ICONOS_REPORTE } from "./iconos"

const FORMATOS: Readonly<Record<string, string>> = {
  xlsx: "Excel",
  pdf: "PDF",
}

function TextoUltimaExportacion({
  ultima,
  ahora,
}: {
  ultima: UltimaExportacion | undefined
  ahora: Date
}) {
  if (!ultima) return <span>Aún sin exportaciones</span>
  const formato = ultima.formato ? FORMATOS[ultima.formato] : null
  const quien = ultima.propia
    ? "por ti"
    : ultima.por
      ? `por ${ultima.por}`
      : null
  return (
    <span className="truncate">
      Exportado{" "}
      <time
        dateTime={ultima.at}
        title={formatearFechaHora(ultima.at)}
        className="text-foreground/80"
      >
        {formatearRelativo(ultima.at, ahora)}
      </time>
      {quien ? ` ${quien}` : null}
      {formato ? ` · ${formato}` : null}
    </span>
  )
}

/**
 * Tarjeta del centro de reportes: qué responde el reporte, con qué filtros,
 * quién lo puede abrir y cuándo se exportó por última vez. Toda la tarjeta
 * es el enlace.
 */
export function TarjetaReporte({
  reporte,
  filtros,
  acceso,
  ultima,
  puedeExportar,
  ahora,
  indice,
}: {
  reporte: ReporteCatalogo
  /** Filtros y acceso tal como aplican a quien mira (`tarjetaPara`). */
  filtros: readonly FiltroReporte[]
  acceso: string
  ultima: UltimaExportacion | undefined
  puedeExportar: boolean
  ahora: Date
  indice: number
}) {
  const Icono = ICONOS_REPORTE[reporte.icono]
  return (
    <li
      className="animate-aparecer-arriba motion-reduce:animate-none"
      style={{ animationDelay: `${indice * 55}ms` }}
    >
      <Link
        href={rutaReporte(reporte.slug)}
        className={cn(
          "group/reporte relative flex h-full flex-col gap-4 overflow-hidden rounded-xl border bg-card p-4 sm:p-5",
          "transition-[border-color,box-shadow,translate] duration-300 ease-suave hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-glow focus-visible:anillo-foco motion-reduce:hover:translate-y-0"
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15 transition-colors group-hover/reporte:bg-primary/15">
            <Icono aria-hidden className="size-5" />
          </span>
          <ArrowUpRight
            aria-hidden
            className="size-4.5 text-muted-foreground/60 transition-[color,translate] duration-200 group-hover/reporte:translate-x-0.5 group-hover/reporte:-translate-y-0.5 group-hover/reporte:text-primary motion-reduce:transition-none"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <h3 className="font-heading text-base leading-snug font-semibold">
            {reporte.titulo}
          </h3>
          <p className="text-[0.8125rem] leading-relaxed text-pretty text-muted-foreground">
            {reporte.descripcion}
          </p>
        </div>

        <ul aria-label="Filtros disponibles" className="flex flex-wrap gap-1.5">
          {filtros.map((filtro) => (
            <li
              key={filtro}
              className="rounded-md bg-muted px-1.5 py-0.5 text-[0.6875rem] font-medium text-muted-foreground"
            >
              {ETIQUETAS_FILTRO[filtro]}
            </li>
          ))}
          {reporte.comparativo ? (
            <li className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[0.6875rem] font-medium text-primary">
              Comparativo
            </li>
          ) : null}
        </ul>

        <div className="mt-auto flex flex-col gap-1.5 border-t pt-3 text-xs text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5">
            <UsersRound aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">{acceso}</span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            {puedeExportar ? (
              <Download aria-hidden className="size-3.5 shrink-0" />
            ) : (
              <History aria-hidden className="size-3.5 shrink-0" />
            )}
            {puedeExportar ? (
              <TextoUltimaExportacion ultima={ultima} ahora={ahora} />
            ) : (
              <span>Solo consulta (sin exportación)</span>
            )}
          </span>
        </div>
      </Link>
    </li>
  )
}
