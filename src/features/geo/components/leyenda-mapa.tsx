"use client"

import { LoaderCircle, RotateCcw } from "lucide-react"
import type { CSSProperties } from "react"

import type { EscalaCoropletica, TemaMapa } from "@/lib/geo/escalas"
import { cn } from "@/lib/utils"

import { describirCalorVacio, formatearValorGeo, unidadGeo } from "../formato"
import { DEFINICIONES_METRICAS, type MetricaGeo } from "../metricas"
import { CLASE_PANEL } from "./lienzo"

/** Clase de la leyenda en foco: índice de clase o "sin datos". */
export type FocoLeyenda = number | "sin-datos" | null

/** Estado del modo calor que explica la leyenda. */
export interface CalorLeyenda {
  readonly estado: "cargando" | "listo" | "vacio" | "error"
  /** Qué se ve y con qué precisión (solo con puntos). */
  readonly nota: string | null
  readonly onReintentar: () => void
}

interface LeyendaMapaProps {
  escala: EscalaCoropletica
  tema: TemaMapa
  metrica: MetricaGeo
  por100k: boolean
  /** Zonas por clase (mismo orden que `escala.leyenda`) y sin dato. */
  conteos: readonly number[]
  sinDatos: number
  zonaPlural: string
  foco: FocoLeyenda
  fijado: FocoLeyenda
  onFoco: (foco: FocoLeyenda) => void
  onFijar: (foco: FocoLeyenda) => void
  /** Con el modo calor activo, la leyenda explica la densidad. */
  calor: CalorLeyenda | null
  compacta?: boolean
  className?: string
}

/** Caracteres que caben bajo una clase de la leyenda (2,25 rem y 2,75 rem de ancho). */
const ETIQUETA_COMPACTA = 5
const ETIQUETA_AMPLIA = 6

const ESTILO_RAYADO: CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(45deg, color-mix(in oklab, var(--foreground) 22%, transparent) 0 2px, transparent 2px 6px)",
}

/**
 * Leyenda interactiva: pasar el puntero (o el foco) por una clase resalta sus
 * zonas en el mapa; un clic la fija. En modo calor explica la densidad.
 */
export function LeyendaMapa({
  escala,
  tema,
  metrica,
  por100k,
  conteos,
  sinDatos,
  zonaPlural,
  foco,
  fijado,
  onFoco,
  onFijar,
  calor,
  compacta = false,
  className,
}: LeyendaMapaProps) {
  const definicion = DEFINICIONES_METRICAS[metrica]
  const unidad = unidadGeo(metrica, por100k)
  // "Medios · medios" es redundante: la unidad solo se muestra si añade algo.
  const mostrarUnidad =
    unidad !== "" &&
    unidad.toLowerCase() !== definicion.tituloCorto.toLowerCase()
  const alternar = (clase: FocoLeyenda) =>
    onFijar(fijado === clase ? null : clase)
  const etiquetas = escala.leyenda.map((clase) =>
    formatearValorGeo(clase.desde, metrica, { compacto: true, por100k })
  )
  // Una etiqueta larga ("$102,1 M") no cabe bajo su clase: se rotula una de
  // cada dos y cada rótulo puede ocupar el hueco de su vecina. El rango exacto
  // de todas sigue en su nombre accesible y en su `title`.
  const rotularAlternas = etiquetas.some(
    (etiqueta) =>
      etiqueta.length > (compacta ? ETIQUETA_COMPACTA : ETIQUETA_AMPLIA)
  )

  if (calor) {
    return (
      <LeyendaCalor
        calor={calor}
        tema={tema}
        metrica={metrica}
        compacta={compacta}
        className={className}
      />
    )
  }

  return (
    <div
      className={cn(CLASE_PANEL, "flex flex-col gap-2 p-3", className)}
      onPointerLeave={() => onFoco(null)}
    >
      <p className="flex items-baseline gap-1.5 text-[0.6875rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        {definicion.tituloCorto}
        {mostrarUnidad ? (
          <span className="font-normal tracking-normal normal-case">
            · {unidad}
          </span>
        ) : null}
      </p>

      <div
        role="group"
        aria-label={`Leyenda de ${definicion.titulo}`}
        className="flex items-end gap-2"
      >
        <div className="flex gap-0.5">
          {escala.leyenda.map((clase, indice) => {
            const activa = foco === indice || fijado === indice
            const rotulada = !rotularAlternas || indice % 2 === 0
            const rango =
              clase.hasta === null
                ? `${etiquetas[indice]} o más`
                : `${etiquetas[indice]} a ${formatearValorGeo(clase.hasta, metrica, { compacto: true, por100k })}`
            return (
              <button
                key={`${clase.color}-${indice}`}
                type="button"
                aria-pressed={fijado === indice}
                aria-label={`${rango}: ${conteos[indice] ?? 0} ${zonaPlural}`}
                title={`${rango} · ${conteos[indice] ?? 0} ${zonaPlural}`}
                onPointerEnter={() => onFoco(indice)}
                onFocus={() => onFoco(indice)}
                onBlur={() => onFoco(null)}
                onClick={() => alternar(indice)}
                className={cn(
                  "group flex flex-col items-start gap-1 rounded-md outline-none focus-visible:anillo-foco",
                  compacta ? "w-9" : "w-11"
                )}
              >
                <span
                  className={cn(
                    "h-2.5 w-full rounded-[3px] ring-1 ring-foreground/10 transition-[transform,box-shadow] duration-200 ease-out",
                    indice === 0 && "rounded-l-full",
                    indice === escala.leyenda.length - 1 && "rounded-r-full",
                    activa && "-translate-y-0.5 shadow-[0_0_0_2px_var(--ring)]"
                  )}
                  style={{ backgroundColor: clase.color }}
                />
                <span
                  aria-hidden
                  className={cn(
                    "text-[0.625rem] leading-none cifras whitespace-nowrap text-muted-foreground group-hover:text-foreground",
                    !rotulada && "invisible"
                  )}
                >
                  {etiquetas[indice]}
                </span>
              </button>
            )
          })}
        </div>

        {sinDatos > 0 ? (
          <button
            type="button"
            aria-pressed={fijado === "sin-datos"}
            aria-label={`Sin datos: ${sinDatos} ${zonaPlural}`}
            title={`Sin datos · ${sinDatos} ${zonaPlural}`}
            onPointerEnter={() => onFoco("sin-datos")}
            onFocus={() => onFoco("sin-datos")}
            onBlur={() => onFoco(null)}
            onClick={() => alternar("sin-datos")}
            className="group ml-1 flex flex-col items-start gap-1 rounded-md outline-none focus-visible:anillo-foco"
          >
            <span
              className={cn(
                "h-2.5 w-9 rounded-full bg-muted ring-1 ring-foreground/10 transition-[transform,box-shadow] duration-200",
                (foco === "sin-datos" || fijado === "sin-datos") &&
                  "-translate-y-0.5 shadow-[0_0_0_2px_var(--ring)]"
              )}
              style={ESTILO_RAYADO}
            />
            <span className="text-[0.625rem] leading-none text-muted-foreground group-hover:text-foreground">
              Sin datos
            </span>
          </button>
        ) : null}
      </div>
    </div>
  )
}

const DEGRADADO_CALOR: Readonly<Record<TemaMapa, string>> = {
  oscuro: "bg-[linear-gradient(90deg,#3F2A76,#7549DE,#A788F6,#DCD0FD,#FFFFFF)]",
  claro: "bg-[linear-gradient(90deg,#EDE7FE,#C3AEFB,#8C66EE,#6238BF,#261848)]",
}

/** Leyenda del modo calor: rampa de densidad, precisión y estado de la carga. */
function LeyendaCalor({
  calor,
  tema,
  metrica,
  compacta,
  className,
}: {
  calor: CalorLeyenda
  tema: TemaMapa
  metrica: MetricaGeo
  compacta: boolean
  className?: string
}) {
  const conPuntos = calor.estado === "listo"
  const mensaje =
    calor.estado === "vacio"
      ? describirCalorVacio(metrica)
      : (MENSAJE_CALOR[calor.estado] ?? calor.nota)
  return (
    <div
      className={cn(
        CLASE_PANEL,
        "flex flex-col gap-2 p-3",
        compacta ? "max-w-[15rem]" : "max-w-[17rem]",
        className
      )}
    >
      <p className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        Densidad · {DEFINICIONES_METRICAS[metrica].tituloCorto}
        {calor.estado === "cargando" ? (
          <LoaderCircle
            aria-hidden
            className="size-3 animate-spin text-primary"
          />
        ) : null}
      </p>
      <div
        aria-hidden
        className={cn(
          "h-2 w-full rounded-full transition-opacity duration-300",
          compacta ? "min-w-40" : "min-w-52",
          DEGRADADO_CALOR[tema],
          !conPuntos && "opacity-35"
        )}
      />
      {conPuntos ? (
        <div className="flex justify-between text-[0.6875rem] text-muted-foreground">
          <span>Menos</span>
          <span>Más</span>
        </div>
      ) : null}
      <p
        role="status"
        className="text-[0.6875rem] leading-snug text-muted-foreground"
      >
        {mensaje}
      </p>
      {calor.estado === "error" ? (
        <button
          type="button"
          onClick={calor.onReintentar}
          className="flex w-fit items-center gap-1.5 rounded-md text-[0.6875rem] font-medium text-primary outline-none hover:underline focus-visible:anillo-foco"
        >
          <RotateCcw aria-hidden className="size-3" />
          Reintentar
        </button>
      ) : null}
    </div>
  )
}

const MENSAJE_CALOR: Partial<Record<CalorLeyenda["estado"], string>> = {
  cargando: "Leyendo las ubicaciones del periodo…",
  error: "No pudimos leer las ubicaciones. El mapa por zonas sigue disponible.",
}
