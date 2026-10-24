"use client"

import { useQueryStates } from "nuqs"
import { useTransition } from "react"

import { parseAsPagina } from "@/components/data-table/estado-url"
import { CLASES_TONO } from "@/features/operacion/components/distintivos"
import { formatearCOP, formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  ESTADOS_PREPARACION,
  type EstadoPreparacion,
  PREPARACION,
} from "../preparacion"
import { plural } from "../textos"
import type { ResumenPorPagar as Resumen } from "../tipos"
import { estadoTablaPorPagar } from "../vistas"
import { BotonArchivoPagos } from "./boton-archivo-pagos"

const parsers = {
  preparacion: estadoTablaPorPagar.parsers.preparacion,
  pagina: parseAsPagina,
}

/** Rótulos cortos de las tarjetas (el completo va de ayuda). */
const ROTULO: Readonly<Record<EstadoPreparacion, string>> = {
  lista: "Listas",
  sin_documento: "Sin documento",
  sin_datos_pago: "Datos incompletos",
  en_archivo: "En un archivo",
}

function cantidadDe(resumen: Resumen, estado: EstadoPreparacion): number {
  switch (estado) {
    case "lista":
      return resumen.listas
    case "sin_documento":
      return resumen.sinDocumento
    case "sin_datos_pago":
      return resumen.sinDatosPago
    case "en_archivo":
      return resumen.enArchivo
  }
}

/**
 * Lo que hay por pagar y qué le falta a cada grupo: cada tarjeta filtra la
 * tabla (botón de alternancia, `aria-pressed`). Al lado, «Generar archivo con
 * las N listas»: el camino habitual (todas las que ya tienen documento y datos
 * de pago y aún no están en un archivo), que funciona igual en el teléfono.
 */
export function ResumenPorPagar({
  resumen,
  puedeVerDatosSensibles,
  onGenerarListas,
}: {
  resumen: Resumen
  puedeVerDatosSensibles: boolean
  onGenerarListas: () => void
}) {
  const [cargando, iniciar] = useTransition()
  const [{ preparacion }, fijar] = useQueryStates(parsers, {
    shallow: false,
    scroll: false,
    startTransition: iniciar,
  })
  const soloUna = preparacion.length === 1 ? preparacion[0] : null

  function elegir(estado: EstadoPreparacion) {
    void fijar({
      preparacion: soloUna === estado ? null : [estado],
      pagina: null,
    })
  }

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
      <section
        aria-label="Liquidaciones por situación"
        aria-busy={cargando}
        className={cn(
          "grid flex-1 grid-cols-2 gap-2 transition-opacity duration-200 motion-reduce:transition-none sm:grid-cols-4 sm:gap-3",
          cargando && "opacity-60"
        )}
      >
        {ESTADOS_PREPARACION.map((estado, indice) => {
          const cantidad = cantidadDe(resumen, estado)
          const activa = soloUna === estado
          return (
            <button
              key={estado}
              type="button"
              aria-pressed={activa}
              aria-label={`${PREPARACION[estado].etiqueta}: ${formatearNumero(cantidad)}`}
              title={PREPARACION[estado].descripcion}
              onClick={() => elegir(estado)}
              style={{ animationDelay: `${indice * 40}ms` }}
              className={cn(
                "flex min-w-0 animate-aparecer-arriba flex-col gap-1 rounded-xl border bg-card px-3 py-2.5 text-left transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/35 hover:bg-muted/40 focus-visible:anillo-foco sm:px-3.5 sm:py-3",
                activa &&
                  "border-primary/55 bg-primary/8 shadow-[inset_0_0_0_1px_var(--color-primary)] hover:bg-primary/10",
                cantidad === 0 && !activa && "text-muted-foreground"
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    CLASES_TONO[PREPARACION[estado].tono].punto
                  )}
                />
                <span className="truncate">{ROTULO[estado]}</span>
              </span>
              <span className="font-heading text-xl font-semibold cifras">
                {formatearNumero(cantidad)}
              </span>
            </button>
          )
        })}
      </section>

      <section
        aria-labelledby="titulo-listas-archivo"
        className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-3.5 sm:flex-row sm:items-center lg:w-[25rem] lg:flex-col lg:items-stretch"
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 id="titulo-listas-archivo" className="text-sm font-medium">
            Listas para el archivo
          </h3>
          <p className="text-sm text-muted-foreground">
            {resumen.listas > 0 ? (
              <>
                <span className="font-heading text-base font-semibold cifras text-foreground">
                  {formatearCOP(resumen.montoListas)}
                </span>{" "}
                · {plural(resumen.listas, "liquidación", "liquidaciones")} de{" "}
                {plural(resumen.archivoListas.medios, "medio", "medios")}
              </>
            ) : (
              "Ninguna lista por ahora: las que tengan documento y datos de pago aparecerán aquí."
            )}
          </p>
        </div>
        {resumen.listas > 0 ? (
          <div className="flex flex-col gap-1.5 sm:items-end lg:items-stretch">
            <BotonArchivoPagos
              size="default"
              puedeVerDatosSensibles={puedeVerDatosSensibles}
              onClick={onGenerarListas}
              explicacionVisible
            >
              {resumen.listas === 1
                ? "Generar archivo con la lista"
                : `Generar archivo con las ${formatearNumero(Math.min(resumen.listas, resumen.archivoListas.ids.length))} listas`}
            </BotonArchivoPagos>
          </div>
        ) : null}
      </section>
    </div>
  )
}
