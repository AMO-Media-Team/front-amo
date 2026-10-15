import { BookOpenText, CalendarSearch, ChevronDown, Info } from "lucide-react"
import type { Route } from "next"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import type { FiltroDocumento } from "@/lib/export/marca"
import { formatearFechaHora } from "@/lib/format"

import type { NotaDefinicion } from "../tipos"

/**
 * Filtros aplicados en palabras, con fechas explícitas y el periodo de
 * comparación: lo mismo que imprime la portada de los documentos.
 */
export function ResumenFiltros({
  filtros,
  consultadoAt,
}: {
  filtros: readonly FiltroDocumento[]
  consultadoAt: Date
}) {
  return (
    <dl
      aria-label="Filtros aplicados"
      className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[0.8125rem]"
    >
      {filtros.map((filtro) => (
        <div key={filtro.etiqueta} className="flex items-baseline gap-1.5">
          <dt className="text-muted-foreground">{filtro.etiqueta}</dt>
          <dd className="font-medium cifras">{filtro.valor}</dd>
        </div>
      ))}
      <div className="flex items-baseline gap-1.5 text-muted-foreground">
        <dt>Datos al</dt>
        <dd className="cifras">
          <time dateTime={consultadoAt.toISOString()}>
            {formatearFechaHora(consultadoAt)}
          </time>
        </dd>
      </div>
    </dl>
  )
}

/**
 * Un solo aviso arriba cuando el periodo no tiene movimientos (en lugar de
 * una tarjeta vacía por gráfico), con lo que aparecerá cuando haya datos y
 * el siguiente paso sugerido.
 */
export function AvisoSinMovimiento({
  titulo,
  descripcion,
  proximos = [],
  accion,
}: {
  titulo: string
  descripcion: string
  /** Gráficos que se mostrarán cuando haya datos. */
  proximos?: readonly string[]
  accion?: { texto: string; href: Route }
}) {
  return (
    <div
      role="note"
      className="flex flex-col gap-4 rounded-xl border border-dashed border-primary/30 bg-primary/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
          <CalendarSearch aria-hidden className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-heading text-[0.9375rem] font-semibold text-pretty">
            {titulo}
          </p>
          <p className="max-w-2xl text-[0.8125rem] text-pretty text-muted-foreground">
            {descripcion}
          </p>
          {proximos.length > 0 ? (
            <div className="mt-2 flex flex-col gap-1.5">
              <p className="text-xs text-muted-foreground">
                Con datos verás aquí:
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {proximos.map((nombre) => (
                  <li
                    key={nombre}
                    className="rounded-md border bg-card px-2 py-0.5 text-xs text-foreground/80"
                  >
                    {nombre}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
      {accion ? (
        <EnlaceBoton
          href={accion.href}
          scroll={false}
          variant="outline"
          className="shrink-0 bg-card dark:bg-input/30"
        >
          {accion.texto}
        </EnlaceBoton>
      ) : null}
    </div>
  )
}

/** Advertencias sobre los datos (muestra pequeña, filtros que un gráfico no admite…). */
export function AvisosReporte({ avisos }: { avisos: readonly string[] }) {
  if (avisos.length === 0) return null
  return (
    <aside
      aria-label="Ten en cuenta"
      className="flex gap-3 rounded-xl border bg-card p-4 text-[0.8125rem]"
    >
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
      <div className="flex flex-col gap-1">
        <p className="font-medium">Ten en cuenta</p>
        <ul className="flex flex-col gap-1 text-pretty text-muted-foreground">
          {avisos.map((aviso) => (
            <li key={aviso}>{aviso}</li>
          ))}
        </ul>
      </div>
    </aside>
  )
}

/**
 * Definiciones del reporte en lenguaje llano (docs/kpis.md): plegadas al
 * final para no competir con las cifras; las mismas notas cierran el PDF y
 * forman la hoja "Cómo leer" del Excel.
 */
export function NotasReporte({ notas }: { notas: readonly NotaDefinicion[] }) {
  if (notas.length === 0) return null
  return (
    <details className="group/notas rounded-xl border bg-card [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl p-4 transition-colors hover:bg-muted/40 focus-visible:anillo-foco sm:p-5">
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <BookOpenText aria-hidden className="size-4.5" />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <h2 className="font-heading text-[0.9375rem] font-semibold">
              Cómo leer este reporte
            </h2>
            <span className="text-[0.8125rem] text-pretty text-muted-foreground">
              Qué significa cada cifra, de dónde sale y cómo se compara.
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="max-sm:sr-only">
            {notas.length} {notas.length === 1 ? "definición" : "definiciones"}
          </span>
          <ChevronDown
            aria-hidden
            className="size-4 transition-transform duration-200 group-open/notas:rotate-180 motion-reduce:transition-none"
          />
        </span>
      </summary>
      <dl className="grid gap-x-10 gap-y-5 border-t px-4 py-5 sm:px-5 md:grid-cols-2">
        {notas.map((nota) => (
          <div key={nota.termino} className="flex flex-col gap-1">
            <dt className="text-sm font-semibold">{nota.termino}</dt>
            <dd className="text-[0.8125rem] leading-relaxed text-pretty text-muted-foreground">
              {nota.explicacion}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
