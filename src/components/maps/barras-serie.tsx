"use client"

import { type KeyboardEvent, useId, useRef, useState } from "react"

import { cn } from "@/lib/utils"

export interface BarraSerie {
  /** `null`: sin valor (muestra insuficiente); se marca en la base. */
  readonly valor: number | null
  /** Periodo incompleto (primera o última cubeta): barra de borde punteado. */
  readonly parcial: boolean
  /** Periodo de la barra ("sept 2026"). */
  readonly etiqueta: string
  /** Valor ya formateado ("$ 1,2 M", "Muestra insuficiente"). */
  readonly texto: string
}

interface BarrasSerieProps {
  readonly barras: readonly BarraSerie[]
  /** Título visible ("Evolución mensual"). */
  readonly titulo: string
  /** Nota bajo el gráfico (periodos parciales, n mínimo…). */
  readonly nota?: string | null
  readonly className?: string
}

/**
 * Mini gráfico de barras para paneles estrechos (detalle del mapa): una barra
 * por periodo, sin ejes; pasar el puntero o el foco por una barra muestra su
 * periodo y su valor en el encabezado. Es una lista accesible (periodo y
 * valor por elemento), no un lienzo.
 */
export function BarrasSerie({
  barras,
  titulo,
  nota,
  className,
}: BarrasSerieProps) {
  const id = useId()
  const lista = useRef<HTMLOListElement>(null)
  const [activa, setActiva] = useState<number | null>(null)
  const maximo = barras.reduce(
    (mayor, barra) => Math.max(mayor, barra.valor ?? 0),
    0
  )
  const ultima = barras.length - 1
  const enFoco = activa ?? ultima
  const lectura = barras[enFoco]

  // Un solo punto de tabulación; las flechas recorren los periodos.
  const mover = (evento: KeyboardEvent<HTMLOListElement>) => {
    const destino =
      evento.key === "ArrowLeft"
        ? enFoco - 1
        : evento.key === "ArrowRight"
          ? enFoco + 1
          : evento.key === "Home"
            ? 0
            : evento.key === "End"
              ? ultima
              : null
    if (destino === null) return
    evento.preventDefault()
    const indice = Math.min(Math.max(destino, 0), ultima)
    setActiva(indice)
    lista.current?.querySelectorAll<HTMLElement>("li")[indice]?.focus()
  }

  return (
    <section
      aria-labelledby={`${id}-titulo`}
      className={cn("flex flex-col gap-2", className)}
    >
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <h3 id={`${id}-titulo`} className="text-muted-foreground">
          {titulo}
        </h3>
        {lectura ? (
          <p aria-hidden className="truncate text-right cifras">
            <span className="text-muted-foreground">{lectura.etiqueta}</span>{" "}
            <span className="font-semibold">{lectura.texto}</span>
          </p>
        ) : null}
      </div>
      <ol
        ref={lista}
        aria-label={`${titulo}: usa las flechas para recorrer los periodos`}
        className="flex h-16 items-end gap-[3px]"
        onPointerLeave={() => setActiva(null)}
        onKeyDown={mover}
      >
        {barras.map((barra, indice) => {
          const alto =
            barra.valor !== null && maximo > 0
              ? Math.max(4, (barra.valor / maximo) * 100)
              : 0
          const destacada = indice === enFoco
          return (
            <li
              key={`${barra.etiqueta}-${indice}`}
              tabIndex={destacada ? 0 : -1}
              aria-label={`${barra.etiqueta}: ${barra.texto}${barra.parcial ? " (periodo incompleto)" : ""}`}
              onPointerEnter={() => setActiva(indice)}
              onFocus={() => setActiva(indice)}
              className="group relative flex h-full min-w-0 flex-1 items-end rounded-[3px] outline-none focus-visible:anillo-foco"
            >
              {barra.valor === null ? (
                <span
                  aria-hidden
                  className="h-1 w-full rounded-full border border-dashed border-foreground/25"
                />
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    "w-full rounded-t-[3px] rounded-b-[1px] transition-[background-color,border-color] duration-200",
                    // El periodo incompleto se distingue por el borde, no por
                    // la intensidad: la última barra suele serlo y además es
                    // la destacada por defecto.
                    barra.parcial
                      ? cn(
                          "border border-dashed",
                          destacada
                            ? "border-primary bg-primary/40"
                            : "border-primary/60 bg-primary/15 group-hover:bg-primary/30"
                        )
                      : destacada
                        ? "bg-primary"
                        : "bg-primary/45 group-hover:bg-primary/70"
                  )}
                  style={{ height: `${alto}%` }}
                />
              )}
            </li>
          )
        })}
      </ol>
      <div
        aria-hidden
        className="flex justify-between gap-3 text-[0.6875rem] text-muted-foreground"
      >
        <span className="truncate">{barras[0]?.etiqueta}</span>
        {ultima > 0 ? (
          <span className="truncate text-right">
            {barras[ultima]?.etiqueta}
          </span>
        ) : null}
      </div>
      {nota ? (
        <p className="text-[0.6875rem] text-muted-foreground">{nota}</p>
      ) : null}
    </section>
  )
}
