"use client"

import { useQueryStates } from "nuqs"
import { useTransition } from "react"

import { parseAsPagina } from "@/components/data-table/estado-url"
import { formatearNumero, formatearPorcentaje } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  ESTADOS_POR_GRUPO,
  type EstadoAsignacion,
  GRUPOS,
  GRUPOS_ASIGNACION,
  type GrupoAsignacion,
} from "../estados"
import { estadoTablaAsignaciones } from "../estado-tablas"
import type { ResumenAsignaciones } from "../tipos"
import { CLASES_TONO } from "./distintivos"

const parsers = {
  estado: estadoTablaAsignaciones.parsers.estado,
  pagina: parseAsPagina,
}

/** El filtro de estado coincide exactamente con los estados del grupo. */
function esGrupo(
  seleccionados: readonly EstadoAsignacion[],
  grupo: GrupoAsignacion
): boolean {
  const estados = ESTADOS_POR_GRUPO[grupo]
  return (
    seleccionados.length === estados.length &&
    estados.every((estado) => seleccionados.includes(estado))
  )
}

function Opcion({
  activa,
  etiqueta,
  descripcion,
  cantidad,
  total,
  punto,
  indice,
  onClick,
}: {
  activa: boolean
  etiqueta: string
  descripcion: string
  cantidad: number
  total: number
  punto: string | null
  indice: number
  onClick: () => void
}) {
  const parte = total > 0 ? cantidad / total : null
  return (
    <button
      type="button"
      aria-pressed={activa}
      title={descripcion}
      onClick={onClick}
      style={{ animationDelay: `${indice * 40}ms` }}
      className={cn(
        "group/grupo flex min-w-0 animate-aparecer-arriba flex-col gap-1 rounded-xl border bg-card px-3 py-2.5 text-left transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/35 hover:bg-muted/40 focus-visible:anillo-foco motion-reduce:animate-none sm:px-3.5 sm:py-3",
        activa &&
          "border-primary/55 bg-primary/8 shadow-[inset_0_0_0_1px_var(--color-primary)] hover:bg-primary/10",
        cantidad === 0 && !activa && "text-muted-foreground"
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {punto ? (
          <span
            aria-hidden
            className={cn("size-1.5 shrink-0 rounded-full", punto)}
          />
        ) : null}
        <span className="truncate">{etiqueta}</span>
      </span>
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-heading text-xl font-semibold cifras">
          {formatearNumero(cantidad)}
        </span>
        {punto && parte !== null && cantidad > 0 ? (
          <span className="text-[0.6875rem] cifras text-muted-foreground max-sm:hidden">
            {parte < 0.005 ? "< 1%" : formatearPorcentaje(parte, 0)}
          </span>
        ) : null}
      </span>
    </button>
  )
}

/**
 * Conteo de asignaciones por grupo de estados con los demás filtros de la
 * vista (búsqueda, plataforma, campaña, medio, periodo). Elegir un grupo
 * filtra la tabla por sus estados; elegirlo otra vez (o "Todas") lo quita.
 */
export function GruposAsignaciones({
  resumen,
}: {
  resumen: ResumenAsignaciones
}) {
  const [cargando, iniciar] = useTransition()
  const [{ estado }, fijar] = useQueryStates(parsers, {
    shallow: false,
    scroll: false,
    startTransition: iniciar,
  })

  function elegir(grupo: GrupoAsignacion | null) {
    const quitar = grupo === null || esGrupo(estado, grupo)
    void fijar({
      estado: quitar ? null : [...ESTADOS_POR_GRUPO[grupo]],
      pagina: null,
    })
  }

  return (
    <section
      aria-label="Asignaciones por grupo de estados"
      aria-busy={cargando}
      className={cn(
        "flex flex-col gap-3 transition-opacity duration-200 motion-reduce:transition-none",
        // La tabla tarda un instante en llegar del servidor: se atenúa mientras tanto.
        cargando && "opacity-60"
      )}
    >
      <div
        aria-hidden
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        {resumen.total > 0
          ? GRUPOS_ASIGNACION.map((grupo) => (
              <span
                key={grupo}
                className={cn(
                  "h-full transition-[width] duration-700 ease-suave motion-reduce:transition-none",
                  CLASES_TONO[GRUPOS[grupo].tono].punto
                )}
                style={{
                  width: `${(resumen.porGrupo[grupo] / resumen.total) * 100}%`,
                }}
              />
            ))
          : null}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-6">
        <Opcion
          indice={0}
          activa={estado.length === 0}
          etiqueta="Todas"
          descripcion="Todas las asignaciones con los filtros actuales."
          cantidad={resumen.total}
          total={resumen.total}
          punto={null}
          onClick={() => elegir(null)}
        />
        {GRUPOS_ASIGNACION.map((grupo, indice) => (
          <Opcion
            key={grupo}
            indice={indice + 1}
            activa={esGrupo(estado, grupo)}
            etiqueta={GRUPOS[grupo].etiqueta}
            descripcion={GRUPOS[grupo].descripcion}
            cantidad={resumen.porGrupo[grupo]}
            total={resumen.total}
            punto={CLASES_TONO[GRUPOS[grupo].tono].punto}
            onClick={() => elegir(grupo)}
          />
        ))}
      </div>
    </section>
  )
}
