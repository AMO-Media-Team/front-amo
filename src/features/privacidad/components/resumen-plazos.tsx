"use client"

import { useQueryStates } from "nuqs"
import { useTransition } from "react"

import { parseAsPagina } from "@/components/data-table/estado-url"
import { CLASES_TONO } from "@/features/operacion/components/distintivos"
import type { Tono } from "@/features/operacion/estados"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import { estadoTablaSolicitudes } from "../bandeja"
import {
  ESTADOS_INTERNO,
  PRESENTACION_SEMAFORO,
  type Semaforo,
  SEMAFOROS,
} from "../presentacion"

const parsers = {
  estado: estadoTablaSolicitudes.parsers.estado,
  vence: estadoTablaSolicitudes.parsers.vence,
  pagina: parseAsPagina,
}

type Grupo = Semaforo | "esperando"

const GRUPOS: readonly Grupo[] = [...SEMAFOROS, "esperando"]

const PRESENTACION: Readonly<
  Record<Grupo, { etiqueta: string; descripcion: string; tono: Tono }>
> = {
  ...PRESENTACION_SEMAFORO,
  esperando: {
    etiqueta: ESTADOS_INTERNO.REQUIERE_INFORMACION.etiqueta,
    descripcion: ESTADOS_INTERNO.REQUIERE_INFORMACION.descripcion,
    tono: "neutro",
  },
}

/**
 * El semáforo de la bandeja: cuántas solicitudes con plazo corriendo están
 * vencidas, vencen hoy, por vencer o en plazo, y cuántas esperan al titular.
 * Elegir un grupo filtra la tabla; elegirlo otra vez lo quita. Son botones de
 * alternancia (`aria-pressed`).
 */
export function ResumenPlazos({
  resumen,
}: {
  resumen: Readonly<Record<Grupo, number>>
}) {
  const [cargando, iniciar] = useTransition()
  const [{ estado, vence }, fijar] = useQueryStates(parsers, {
    shallow: false,
    scroll: false,
    startTransition: iniciar,
  })
  const activo: Grupo | null =
    vence.length === 1 && estado.length === 0
      ? vence[0]
      : vence.length === 0 &&
          estado.length === 1 &&
          estado[0] === "REQUIERE_INFORMACION"
        ? "esperando"
        : null

  function elegir(grupo: Grupo) {
    if (activo === grupo) {
      void fijar({ estado: null, vence: null, pagina: null })
    } else if (grupo === "esperando") {
      void fijar({
        estado: ["REQUIERE_INFORMACION"],
        vence: null,
        pagina: null,
      })
    } else {
      void fijar({ estado: null, vence: [grupo], pagina: null })
    }
  }

  return (
    <section
      aria-label="Solicitudes por plazo"
      aria-busy={cargando}
      className={cn(
        "grid grid-cols-2 gap-2 transition-opacity duration-200 motion-reduce:transition-none sm:grid-cols-3 sm:gap-3 lg:grid-cols-5",
        cargando && "opacity-60"
      )}
    >
      {GRUPOS.map((grupo, indice) => {
        const cantidad = resumen[grupo]
        const { etiqueta, descripcion, tono } = PRESENTACION[grupo]
        const seleccionado = activo === grupo
        return (
          <button
            key={grupo}
            type="button"
            aria-pressed={seleccionado}
            aria-label={`${etiqueta}: ${formatearNumero(cantidad)}`}
            title={descripcion}
            onClick={() => elegir(grupo)}
            style={{ animationDelay: `${indice * 40}ms` }}
            className={cn(
              "flex min-w-0 animate-aparecer-arriba flex-col gap-1 rounded-xl border bg-card px-3 py-2.5 text-left transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/35 hover:bg-muted/40 focus-visible:anillo-foco sm:px-3.5 sm:py-3",
              seleccionado &&
                "border-primary/55 bg-primary/8 shadow-[inset_0_0_0_1px_var(--color-primary)] hover:bg-primary/10",
              cantidad === 0 && !seleccionado && "text-muted-foreground"
            )}
          >
            <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span
                aria-hidden
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  CLASES_TONO[tono].punto
                )}
              />
              <span className="truncate">{etiqueta}</span>
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
