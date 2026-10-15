"use client"

import { useRouter } from "next/navigation"
import { type CSSProperties, useId, useMemo, useState } from "react"

import { departamentoPorCodigo } from "@/features/geo/departamentos"
import { formatearValorGeo } from "@/features/geo/formato"
import type { MetricaGeo } from "@/features/geo/metricas"
import { type PeriodoEnlace, rutaExplorador } from "@/features/geo/rutas"
import { crearEscalaCuantiles, COLOR_SIN_DATOS } from "@/lib/geo/escalas"
import {
  PATHS_DEPARTAMENTOS,
  RECUADRO_SAN_ANDRES,
  VIEWBOX_COLOMBIA,
} from "@/lib/geo/svg-departamentos"
import { cn } from "@/lib/utils"

export interface MiniMapaColombiaProps {
  /** Valor por código DANE; `null` o ausente = sin datos. */
  valores: Readonly<Record<string, number | null>>
  /** Métrica de los valores (formato de cifras y título accesible). */
  metrica: MetricaGeo
  /** Nombre accesible ("Medios verificados por departamento"). */
  etiqueta: string
  /** Departamento resaltado. */
  destacado?: string | null
  /**
   * Cada departamento abre el explorador geográfico en ese departamento, con
   * la misma métrica del mini-mapa y el `periodo` de quien lo muestra.
   */
  enlazar?: boolean
  /** Periodo de las cifras; viaja en los enlaces al explorador. */
  periodo?: PeriodoEnlace
  /** Muestra la leyenda de clases bajo el mapa. */
  conLeyenda?: boolean
  /** Cómo se nombra una zona sin dato, en la leyenda y en cada zona ("Sin ingresos"). */
  etiquetaSinDatos?: string
  className?: string
}

type EstiloRelleno = CSSProperties & {
  "--relleno-claro": string
  "--relleno-oscuro": string
}

const CODIGOS = Object.keys(PATHS_DEPARTAMENTOS)

/**
 * Mini-mapa coroplético de Colombia en SVG pre-proyectado (sin Mapbox): para
 * paneles de inicio y reportes. Colores por cuantiles con la paleta de ambos
 * temas en variables CSS (sin desajustes de hidratación); "sin datos" rayado.
 */
export function MiniMapaColombia({
  valores,
  metrica,
  etiqueta,
  destacado = null,
  enlazar = false,
  periodo,
  conLeyenda = true,
  etiquetaSinDatos = "Sin datos",
  className,
}: MiniMapaColombiaProps) {
  const id = useId()
  const router = useRouter()
  const [hover, setHover] = useState<string | null>(null)

  const { escalaOscura, escalaClara } = useMemo(() => {
    const numeros = Object.values(valores).filter(
      (valor): valor is number => valor !== null && Number.isFinite(valor)
    )
    return {
      escalaOscura: crearEscalaCuantiles(numeros, { tema: "oscuro" }),
      escalaClara: crearEscalaCuantiles(numeros, { tema: "claro" }),
    }
  }, [valores])

  const estiloDe = (codigo: string): EstiloRelleno => ({
    "--relleno-claro": escalaClara.colorPara(valores[codigo]),
    "--relleno-oscuro": escalaOscura.colorPara(valores[codigo]),
  })

  // Mismo destino que las filas del ranking vecino: métrica y periodo incluidos.
  const abrirExplorador = (codigo: string) =>
    router.push(rutaExplorador({ departamento: codigo, metrica, periodo }))

  const activo = hover ?? destacado
  const departamentoActivo = departamentoPorCodigo(activo)
  const patron = `${id}-rayado`
  const cifraDe = (codigo: string): string => {
    const valor = valores[codigo]
    return valor === null || valor === undefined
      ? etiquetaSinDatos
      : formatearValorGeo(valor, metrica)
  }

  return (
    <figure className={cn("flex flex-col gap-3", className)}>
      <div className="relative">
        <svg
          viewBox={VIEWBOX_COLOMBIA}
          role="group"
          aria-label={etiqueta}
          className="h-auto w-full"
        >
          <defs>
            <pattern
              id={patron}
              width={10}
              height={10}
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect
                width={10}
                height={10}
                className="fill-[var(--sin-claro)] dark:fill-[var(--sin-oscuro)]"
                style={
                  {
                    "--sin-claro": COLOR_SIN_DATOS.claro,
                    "--sin-oscuro": COLOR_SIN_DATOS.oscuro,
                  } as CSSProperties
                }
              />
              <line
                x1={0}
                y1={0}
                x2={0}
                y2={10}
                strokeWidth={3}
                className="stroke-foreground/15"
              />
            </pattern>
          </defs>

          <rect
            x={RECUADRO_SAN_ANDRES.x}
            y={RECUADRO_SAN_ANDRES.y}
            width={RECUADRO_SAN_ANDRES.ancho}
            height={RECUADRO_SAN_ANDRES.alto}
            rx={14}
            className="fill-none stroke-border"
            strokeDasharray="6 6"
            strokeWidth={2}
          />

          {CODIGOS.map((codigo) => {
            const departamento = departamentoPorCodigo(codigo)
            const valor = valores[codigo]
            const sinDato = valor === null || valor === undefined
            const texto = `${departamento?.nombre ?? codigo}: ${cifraDe(codigo)}`
            return (
              <path
                key={codigo}
                d={PATHS_DEPARTAMENTOS[codigo]}
                style={sinDato ? undefined : estiloDe(codigo)}
                fill={sinDato ? `url(#${patron})` : undefined}
                // Sin enlaces, cada departamento sigue siendo legible (nombre y
                // cifra) para lectores de pantalla, sin ser un control.
                tabIndex={enlazar ? 0 : undefined}
                role={enlazar ? "link" : "img"}
                aria-label={texto}
                onPointerEnter={() => setHover(codigo)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(codigo)}
                onBlur={() => setHover(null)}
                onClick={enlazar ? () => abrirExplorador(codigo) : undefined}
                onKeyDown={
                  enlazar
                    ? (evento) => {
                        if (evento.key === "Enter") abrirExplorador(codigo)
                      }
                    : undefined
                }
                className={cn(
                  "stroke-background transition-[opacity,stroke] duration-200 outline-none",
                  !sinDato &&
                    "fill-(--relleno-claro) dark:fill-(--relleno-oscuro)",
                  enlazar && "cursor-pointer",
                  activo === codigo
                    ? "stroke-foreground [stroke-width:3]"
                    : "[stroke-width:1.5]",
                  activo && activo !== codigo && "opacity-60"
                )}
              >
                <title>{texto}</title>
              </path>
            )
          })}
        </svg>

        {/* Lectura visual del puntero; el nombre accesible de cada zona ya la trae. */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute right-2 bottom-2 rounded-lg vidrio px-2.5 py-1.5 text-xs shadow-sm transition-opacity duration-200",
            departamentoActivo ? "opacity-100" : "opacity-0"
          )}
        >
          {departamentoActivo ? (
            <>
              <span className="font-medium">
                {departamentoActivo.nombreCorto}
              </span>{" "}
              <span className="cifras text-muted-foreground">
                {cifraDe(departamentoActivo.codigo)}
              </span>
            </>
          ) : null}
        </div>
      </div>

      {conLeyenda && escalaOscura.leyenda.length > 0 ? (
        <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.6875rem] text-muted-foreground">
          {escalaOscura.leyenda.map((clase, indice) => (
            <span key={indice} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 rounded-[3px] bg-(--c-claro) dark:bg-(--c-oscuro)"
                style={
                  {
                    "--c-claro": escalaClara.leyenda[indice]?.color,
                    "--c-oscuro": clase.color,
                  } as CSSProperties
                }
              />
              <span className="cifras">
                {formatearValorGeo(clase.desde, metrica, { compacto: true })}
                {clase.hasta === null ? "+" : ""}
              </span>
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <svg
              aria-hidden
              className="size-2.5 rounded-[3px]"
              viewBox="0 0 10 10"
            >
              <rect width={10} height={10} fill={`url(#${patron})`} />
            </svg>
            {etiquetaSinDatos}
          </span>
        </figcaption>
      ) : null}
    </figure>
  )
}
