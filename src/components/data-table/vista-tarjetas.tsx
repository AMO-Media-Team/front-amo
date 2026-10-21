"use client"

import { FlexRender } from "@tanstack/react-table"
import type { MouseEvent, ReactNode } from "react"

import { cn } from "@/lib/utils"

import {
  type CeldaTabla,
  type FilaTabla,
  ID_COLUMNA_ACCIONES,
  ID_COLUMNA_SELECCION,
  type PapelTarjeta,
  type RowData,
} from "./columnas"

interface VistaTarjetasProps<TFila extends RowData> {
  filas: readonly FilaTabla<TFila>[]
  cargando: boolean
  onClickFila?: (
    fila: FilaTabla<TFila>,
    evento: MouseEvent<HTMLElement>
  ) => void
  className?: string
}

function papel<TFila extends RowData>(
  celda: CeldaTabla<TFila>
): PapelTarjeta | "accion" | "seleccion" {
  if (celda.column.id === ID_COLUMNA_SELECCION) return "seleccion"
  if (celda.column.id === ID_COLUMNA_ACCIONES) return "accion"
  return celda.column.columnDef.meta?.tarjeta ?? "detalle"
}

function Celda<TFila extends RowData>({
  celda,
}: {
  celda: CeldaTabla<TFila> | undefined
}): ReactNode {
  return celda ? <FlexRender cell={celda} /> : null
}

/**
 * Vista de tarjetas para pantallas < 768 px: la misma fila y las mismas
 * celdas que la tabla (respeta columnas ocultas), en una lista legible.
 * Columna "titulo" arriba; "detalle" como pares etiqueta/valor.
 */
export function VistaTarjetas<TFila extends RowData>({
  filas,
  cargando,
  onClickFila,
  className,
}: VistaTarjetasProps<TFila>) {
  return (
    <ul
      aria-busy={cargando}
      className={cn(
        "flex flex-col gap-2 transition-opacity",
        cargando && "opacity-60",
        className
      )}
    >
      {filas.map((fila, indice) => {
        const celdas = fila.getVisibleCells()
        const seleccion = celdas.find((c) => papel(c) === "seleccion")
        const titulo = celdas.find((c) => papel(c) === "titulo")
        const accion = celdas.find((c) => papel(c) === "accion")
        const detalles = celdas.filter((c) => papel(c) === "detalle")

        return (
          <li
            key={fila.id}
            data-state={fila.getIsSelected() ? "selected" : undefined}
            onClick={
              onClickFila ? (evento) => onClickFila(fila, evento) : undefined
            }
            style={{ animationDelay: `${Math.min(indice, 10) * 30}ms` }}
            className={cn(
              "animate-aparecer-arriba rounded-xl border bg-card p-4 shadow-xs transition-colors motion-reduce:animate-none",
              "data-[state=selected]:border-primary/50 data-[state=selected]:bg-primary/5",
              onClickFila && "cursor-pointer active:bg-muted/40"
            )}
          >
            <div className="flex items-start gap-3">
              {seleccion ? (
                <div className="pt-2.5">
                  <Celda celda={seleccion} />
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                <Celda celda={titulo} />
              </div>
              {accion ? (
                <div className="-mt-1 -mr-2 shrink-0">
                  <Celda celda={accion} />
                </div>
              ) : null}
            </div>
            {detalles.length > 0 ? (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t pt-3 text-sm">
                {detalles.map((celda) => (
                  <div key={celda.id} className="flex min-w-0 flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">
                      {celda.column.columnDef.meta?.titulo}
                    </dt>
                    <dd className="min-w-0 truncate">
                      <Celda celda={celda} />
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
