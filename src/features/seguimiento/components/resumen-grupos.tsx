"use client"

import { CLASES_TONO } from "@/features/operacion/components/distintivos"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import { GRUPOS, GRUPOS_SEGUIMIENTO, type GrupoSeguimiento } from "../estados"

function Opcion({
  activa,
  etiqueta,
  descripcion,
  cantidad,
  punto,
  onClick,
}: {
  activa: boolean
  etiqueta: string
  descripcion: string
  cantidad: number
  punto: string | null
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={activa}
      title={descripcion}
      onClick={onClick}
      className={cn(
        "flex min-h-11 min-w-0 flex-col gap-0.5 rounded-xl border bg-card px-3 py-2 text-left transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/35 hover:bg-muted/40 focus-visible:anillo-foco",
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
      <span className="font-heading text-lg leading-tight font-semibold cifras">
        {formatearNumero(cantidad)}
      </span>
    </button>
  )
}

/**
 * Cuántas asignaciones hay en cada grupo y filtro de la lista: elegir un
 * grupo muestra solo las suyas; elegirlo otra vez (o «Todas») lo quita. «En
 * disputa» solo aparece si hay alguna. Los botones dicen su estado con
 * `aria-pressed`.
 */
export function ResumenGrupos({
  conteo,
  total,
  seleccionado,
  onElegir,
}: {
  conteo: Readonly<Record<GrupoSeguimiento, number>>
  total: number
  seleccionado: GrupoSeguimiento | null
  onElegir: (grupo: GrupoSeguimiento | null) => void
}) {
  const visibles = GRUPOS_SEGUIMIENTO.filter(
    (grupo) => grupo !== "en_disputa" || conteo.en_disputa > 0
  )
  return (
    <div
      role="group"
      aria-label="Filtrar las asignaciones por estado"
      className={cn(
        "grid grid-cols-2 gap-2 sm:grid-cols-3",
        visibles.length + 1 === 6 ? "lg:grid-cols-6" : "lg:grid-cols-5"
      )}
    >
      <Opcion
        activa={seleccionado === null}
        etiqueta="Todas"
        descripcion="Todas las asignaciones de la campaña."
        cantidad={total}
        punto={null}
        onClick={() => onElegir(null)}
      />
      {visibles.map((grupo) => (
        <Opcion
          key={grupo}
          activa={seleccionado === grupo}
          etiqueta={GRUPOS[grupo].etiqueta}
          descripcion={GRUPOS[grupo].descripcion}
          cantidad={conteo[grupo]}
          punto={CLASES_TONO[GRUPOS[grupo].tono].punto}
          onClick={() => onElegir(seleccionado === grupo ? null : grupo)}
        />
      ))}
    </div>
  )
}
