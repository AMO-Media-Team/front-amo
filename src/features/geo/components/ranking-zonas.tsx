"use client"

import { ChevronRight } from "lucide-react"
import { type KeyboardEvent, useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

import type { FilaRanking, Ranking } from "../agregacion"
import { formatearParticipacion, formatearValorGeo } from "../formato"
import { DEFINICIONES_METRICAS, type MetricaGeo } from "../metricas"

interface RankingZonasProps {
  ranking: Ranking
  metrica: MetricaGeo
  por100k: boolean
  /** Color de la clase de cada zona (el mismo del mapa). */
  colorDe: (valor: number | null) => string
  seleccionado: string | null
  resaltado: string | null
  puedeExplorar: (codigo: string) => boolean
  onResaltar: (codigo: string | null) => void
  onSeleccionar: (codigo: string) => void
  onExplorar: (codigo: string) => void
  zonaSingular: string
  /** Filas fuera del foco de la leyenda se atenúan (`null`: sin foco). */
  enFoco?: ((fila: FilaRanking) => boolean) | null
  className?: string
}

function Posicion({ posicion }: { posicion: number | null }) {
  return (
    <span
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-md text-[0.6875rem] font-semibold cifras",
        posicion !== null && posicion <= 3
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground"
      )}
    >
      {posicion ?? "–"}
    </span>
  )
}

/**
 * Ranking navegable con teclado y sincronizado con el mapa: ↑/↓ recorren
 * las filas, Enter selecciona y → (o el chevrón) baja de nivel. El hover
 * resalta la zona en el mapa y viceversa.
 */
export function RankingZonas({
  ranking,
  metrica,
  por100k,
  colorDe,
  seleccionado,
  resaltado,
  puedeExplorar,
  onResaltar,
  onSeleccionar,
  onExplorar,
  zonaSingular,
  enFoco = null,
  className,
}: RankingZonasProps) {
  const filas = ranking.filas
  const [activa, setActiva] = useState(0)
  const indiceActivo = Math.min(activa, Math.max(filas.length - 1, 0))
  const botones = useRef<(HTMLButtonElement | null)[]>([])
  const aditiva = DEFINICIONES_METRICAS[metrica].aditiva

  // La fila seleccionada desde el mapa se hace visible dentro de la lista.
  useEffect(() => {
    if (!seleccionado) return
    const indice = filas.findIndex((fila) => fila.codigo === seleccionado)
    botones.current[indice]?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    })
  }, [seleccionado, filas])

  const enfocar = (indice: number) => {
    const destino = Math.max(0, Math.min(filas.length - 1, indice))
    setActiva(destino)
    botones.current[destino]?.focus()
  }

  const alTeclear = (
    evento: KeyboardEvent,
    fila: FilaRanking,
    indice: number
  ) => {
    switch (evento.key) {
      case "ArrowDown":
        evento.preventDefault()
        enfocar(indice + 1)
        break
      case "ArrowUp":
        evento.preventDefault()
        enfocar(indice - 1)
        break
      case "Home":
        evento.preventDefault()
        enfocar(0)
        break
      case "End":
        evento.preventDefault()
        enfocar(filas.length - 1)
        break
      case "ArrowRight":
        if (puedeExplorar(fila.codigo)) {
          evento.preventDefault()
          onExplorar(fila.codigo)
        }
        break
    }
  }

  return (
    <ol
      aria-label={`Ranking por ${DEFINICIONES_METRICAS[metrica].titulo.toLowerCase()}`}
      className={cn("flex flex-col gap-px", className)}
      onPointerLeave={() => onResaltar(null)}
    >
      {filas.map((fila, indice) => {
        const explorable = puedeExplorar(fila.codigo)
        const seleccionada = fila.codigo === seleccionado
        const conDato = fila.valor !== null
        // Mínimo visible solo para valores positivos: un cero no lleva barra.
        const ancho =
          fila.valor !== null && fila.valor > 0 && ranking.maximo > 0
            ? Math.max(3, (fila.valor / ranking.maximo) * 100)
            : 0
        return (
          <li
            key={fila.codigo}
            className={cn(
              "group/fila relative flex items-center rounded-xl transition-[background-color,opacity] duration-150",
              enFoco && !enFoco(fila) && "opacity-40",
              seleccionada
                ? "bg-primary/12 ring-1 ring-primary/35"
                : resaltado === fila.codigo
                  ? "bg-foreground/6"
                  : "hover:bg-foreground/5"
            )}
            onPointerEnter={() => onResaltar(fila.codigo)}
          >
            <button
              ref={(nodo) => {
                botones.current[indice] = nodo
              }}
              type="button"
              tabIndex={indice === indiceActivo ? 0 : -1}
              aria-current={seleccionada ? "true" : undefined}
              aria-keyshortcuts={explorable ? "ArrowRight" : undefined}
              onClick={() => {
                setActiva(indice)
                onSeleccionar(fila.codigo)
              }}
              onFocus={() => {
                setActiva(indice)
                onResaltar(fila.codigo)
              }}
              onKeyDown={(evento) => alTeclear(evento, fila, indice)}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl py-2 pr-1 pl-1.5 text-left outline-none focus-visible:anillo-foco"
            >
              <Posicion posicion={fila.posicion} />
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="flex items-baseline justify-between gap-2">
                  <span
                    className={cn(
                      "truncate text-[0.8125rem]",
                      seleccionada ? "font-semibold" : "font-medium",
                      !conDato && "text-muted-foreground"
                    )}
                  >
                    {fila.nombre}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-xs cifras",
                      conDato ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {conDato
                      ? formatearValorGeo(fila.valor, metrica, {
                          compacto: true,
                          por100k,
                        })
                      : aditiva
                        ? "Sin datos"
                        : `n = ${fila.n ?? 0}`}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="h-1 w-full overflow-hidden rounded-full bg-foreground/6"
                >
                  <span
                    className="block h-full rounded-full transition-[width] duration-500 ease-out"
                    style={{
                      width: `${ancho}%`,
                      backgroundColor: colorDe(fila.valor),
                    }}
                  />
                </span>
              </span>
              <span className="sr-only">
                {fila.participacion !== null
                  ? `, ${formatearParticipacion(fila.participacion)} del total`
                  : ""}
              </span>
            </button>
            {explorable ? (
              <button
                type="button"
                tabIndex={indice === indiceActivo ? 0 : -1}
                aria-label={`Explorar ${fila.nombre}`}
                onClick={() => onExplorar(fila.codigo)}
                className="mr-1 grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground opacity-60 transition-[opacity,background-color,color] outline-none group-hover/fila:opacity-100 hover:bg-primary/15 hover:text-primary focus-visible:opacity-100 focus-visible:anillo-foco"
              >
                <ChevronRight aria-hidden className="size-4" />
              </button>
            ) : (
              <span className="mr-1 size-7 shrink-0" aria-hidden />
            )}
          </li>
        )
      })}
      {filas.length === 0 ? (
        <li className="px-3 py-6 text-center text-sm text-muted-foreground">
          Ningún {zonaSingular.toLowerCase()} tiene datos en este periodo.
        </li>
      ) : null}
    </ol>
  )
}
