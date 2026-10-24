"use client"

import { useQueryStates } from "nuqs"
import { useTransition } from "react"

import { parseAsPagina } from "@/components/data-table/estado-url"
import { CLASES_TONO } from "@/features/operacion/components/distintivos"
import type { Tono } from "@/features/operacion/estados"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  estadoTablaDisputas,
  GRUPOS,
  GRUPOS_DISPUTA,
  type GrupoDisputa,
} from "../bandeja"
import type { ResumenBandeja as Resumen } from "../tipos"

const parsers = {
  estado: estadoTablaDisputas.parsers.estado,
  pagina: parseAsPagina,
}

const TONO_GRUPO: Readonly<Record<GrupoDisputa, Tono>> = {
  abiertas: "peligro",
  en_revision: "aviso",
  cerradas: "neutro",
}

/**
 * Cuántas disputas hay abiertas, en revisión y cerradas con los demás filtros
 * de la vista. Elegir un grupo filtra la tabla; elegirlo otra vez lo quita.
 * Son botones de alternancia (`aria-pressed`): el lector de pantalla dice
 * cuál está activo.
 */
export function ResumenBandeja({ resumen }: { resumen: Resumen }) {
  const [cargando, iniciar] = useTransition()
  const [{ estado }, fijar] = useQueryStates(parsers, {
    shallow: false,
    scroll: false,
    startTransition: iniciar,
  })
  const soloUno = estado.length === 1 ? estado[0] : null

  function elegir(grupo: GrupoDisputa) {
    void fijar({ estado: soloUno === grupo ? null : [grupo], pagina: null })
  }

  return (
    <section
      aria-label="Disputas por estado"
      aria-busy={cargando}
      className={cn(
        "grid grid-cols-3 gap-2 transition-opacity duration-200 motion-reduce:transition-none sm:gap-3",
        cargando && "opacity-60"
      )}
    >
      {GRUPOS_DISPUTA.map((grupo, indice) => {
        const cantidad = resumen[grupo]
        const activa = soloUno === grupo
        return (
          <button
            key={grupo}
            type="button"
            aria-pressed={activa}
            aria-label={`${GRUPOS[grupo].etiqueta}: ${formatearNumero(cantidad)}`}
            title={GRUPOS[grupo].descripcion}
            onClick={() => elegir(grupo)}
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
                  CLASES_TONO[TONO_GRUPO[grupo]].punto
                )}
              />
              <span className="truncate">{GRUPOS[grupo].etiqueta}</span>
            </span>
            <span className="font-heading text-xl font-semibold cifras">
              {formatearNumero(cantidad)}
            </span>
          </button>
        )
      })}
    </section>
  )
}
