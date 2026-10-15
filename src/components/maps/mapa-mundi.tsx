"use client"

import type { FeatureCollection, Geometry } from "geojson"
import {
  type CSSProperties,
  type KeyboardEvent,
  useMemo,
  useState,
} from "react"

import {
  COLOR_SIN_DATOS,
  crearEscalaCuantiles,
  type EscalaCoropletica,
} from "@/lib/geo/escalas"
import type { Posicion } from "@/lib/geo/tipos"
import { cn } from "@/lib/utils"

import {
  proyectarEnMundo,
  trazarPaises,
  VIEWBOX_MUNDO,
} from "./proyeccion-mundo"

export interface ZonaMundo {
  /** ISO 3166-1 alfa-2. */
  readonly codigo: string
  readonly nombre: string
  readonly valor: number
  /** Centro de los países sin polígono (microestados): se dibujan como círculo. */
  readonly centro?: Posicion
}

export interface MapaMundiProps {
  /** `public/data/geo/paises.json` (el mismo que usa el explorador). */
  readonly coleccion: FeatureCollection<
    Geometry,
    { codigo: string; nombre: string }
  >
  readonly zonas: readonly ZonaMundo[]
  /** Nombre accesible del mapa. */
  readonly etiqueta: string
  readonly formatear: (valor: number) => string
  /** Elegir un país con datos (clic, Enter o Espacio). */
  readonly onElegir?: (codigo: string) => void
  /** Nombre accesible de la acción ("Ver los ingresos de Colombia"). */
  readonly describirAccion?: (zona: ZonaMundo) => string
  readonly className?: string
}

type EstiloRelleno = CSSProperties & {
  "--relleno-claro": string
  "--relleno-oscuro": string
}

const ESTILO_SIN_DATOS = {
  "--relleno-claro": COLOR_SIN_DATOS.claro,
  "--relleno-oscuro": COLOR_SIN_DATOS.oscuro,
} as EstiloRelleno

function estiloDe(
  valor: number,
  escalas: { claro: EscalaCoropletica; oscuro: EscalaCoropletica }
): EstiloRelleno {
  return {
    "--relleno-claro": escalas.claro.colorPara(valor),
    "--relleno-oscuro": escalas.oscuro.colorPara(valor),
  }
}

/** Radio (unidades del lienzo) de un microestado: visible aunque su cifra sea mínima. */
const RADIO_CIRCULO = 6

/**
 * Planisferio coroplético en SVG (Equal Earth), sin Mapbox: para tarjetas y
 * reportes. Colores por cuantiles con la rampa de ambos temas en variables
 * CSS (sin desajustes de hidratación). Los países sin datos quedan neutros y
 * fuera del orden de tabulación; los que tienen datos son enfocables y, con
 * `onElegir`, accionables.
 */
export function MapaMundi({
  coleccion,
  zonas,
  etiqueta,
  formatear,
  onElegir,
  describirAccion,
  className,
}: MapaMundiProps) {
  const [activo, setActivo] = useState<string | null>(null)
  const paises = useMemo(() => trazarPaises(coleccion), [coleccion])
  const porCodigo = useMemo(
    () => new Map(zonas.map((zona) => [zona.codigo, zona])),
    [zonas]
  )
  const escalas = useMemo(() => {
    const valores = zonas.map((zona) => zona.valor)
    return {
      claro: crearEscalaCuantiles(valores, { tema: "claro" }),
      oscuro: crearEscalaCuantiles(valores, { tema: "oscuro" }),
    }
  }, [zonas])
  const conPoligono = useMemo(
    () => new Set(paises.map((p) => p.codigo)),
    [paises]
  )
  const circulos = zonas.filter(
    (zona) => zona.centro && !conPoligono.has(zona.codigo)
  )
  const zonaActiva = activo ? porCodigo.get(activo) : undefined

  const propsInteractivas = (zona: ZonaMundo) => ({
    tabIndex: 0,
    role: onElegir ? "button" : "img",
    "aria-label":
      describirAccion?.(zona) ?? `${zona.nombre}: ${formatear(zona.valor)}`,
    onPointerEnter: () => setActivo(zona.codigo),
    onPointerLeave: () => setActivo(null),
    onFocus: () => setActivo(zona.codigo),
    onBlur: () => setActivo(null),
    onClick: onElegir ? () => onElegir(zona.codigo) : undefined,
    onKeyDown: onElegir
      ? (evento: KeyboardEvent) => {
          if (evento.key === "Enter" || evento.key === " ") {
            evento.preventDefault()
            onElegir(zona.codigo)
          }
        }
      : undefined,
  })

  const claseZona = (codigo: string) =>
    cn(
      "fill-(--relleno-claro) stroke-background transition-[opacity,stroke-width] duration-200 outline-none dark:fill-(--relleno-oscuro)",
      activo === codigo
        ? "stroke-foreground [stroke-width:1.6]"
        : "[stroke-width:0.5]",
      activo && activo !== codigo && "opacity-70"
    )

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox={VIEWBOX_MUNDO}
        role="group"
        aria-label={etiqueta}
        className="h-auto w-full"
      >
        {paises.map((pais) => {
          const zona = porCodigo.get(pais.codigo)
          if (!zona) {
            return (
              <path
                key={pais.codigo}
                d={pais.trazo}
                aria-hidden
                style={ESTILO_SIN_DATOS}
                className="fill-(--relleno-claro) stroke-background [stroke-width:0.5] dark:fill-(--relleno-oscuro)"
              />
            )
          }
          return (
            <path
              key={pais.codigo}
              d={pais.trazo}
              style={estiloDe(zona.valor, escalas)}
              className={cn(
                claseZona(pais.codigo),
                onElegir && "cursor-pointer"
              )}
              {...propsInteractivas(zona)}
            >
              <title>{`${zona.nombre}: ${formatear(zona.valor)}`}</title>
            </path>
          )
        })}
        {circulos.map((zona) => {
          const [x, y] = proyectarEnMundo(zona.centro as Posicion)
          return (
            <circle
              key={zona.codigo}
              cx={x}
              cy={y}
              r={RADIO_CIRCULO}
              style={estiloDe(zona.valor, escalas)}
              className={cn(
                claseZona(zona.codigo),
                "[stroke-width:1.2]",
                onElegir && "cursor-pointer"
              )}
              {...propsInteractivas(zona)}
            >
              <title>{`${zona.nombre}: ${formatear(zona.valor)}`}</title>
            </circle>
          )
        })}
      </svg>

      {/* Lectura visual del puntero; el nombre accesible de cada país ya la trae. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute bottom-2 left-2 rounded-lg vidrio px-2.5 py-1.5 text-xs shadow-sm transition-opacity duration-200",
          zonaActiva ? "opacity-100" : "opacity-0"
        )}
      >
        {zonaActiva ? (
          <>
            <span className="font-medium">{zonaActiva.nombre}</span>{" "}
            <span className="cifras text-muted-foreground">
              {formatear(zonaActiva.valor)}
            </span>
          </>
        ) : null}
      </div>
    </div>
  )
}

/** Clases de color del planisferio para pintar su leyenda fuera del SVG. */
export function leyendaMundo(zonas: readonly ZonaMundo[]) {
  const valores = zonas.map((zona) => zona.valor)
  const claro = crearEscalaCuantiles(valores, { tema: "claro" })
  const oscuro = crearEscalaCuantiles(valores, { tema: "oscuro" })
  return oscuro.leyenda.map((clase, indice) => ({
    desde: clase.desde,
    hasta: clase.hasta,
    colorClaro: claro.leyenda[indice]?.color ?? clase.color,
    colorOscuro: clase.color,
  }))
}
