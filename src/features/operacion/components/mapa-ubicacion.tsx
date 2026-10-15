import { proyectar } from "@/lib/geo/proyeccion"
import {
  CENTROS_DEPARTAMENTOS,
  PATHS_DEPARTAMENTOS,
  PROYECCION_CONTINENTAL,
  PROYECCION_SAN_ANDRES,
  RECUADRO_SAN_ANDRES,
  VIEWBOX_COLOMBIA,
} from "@/lib/geo/svg-departamentos"
import { cn } from "@/lib/utils"

const SAN_ANDRES = "88"
const CODIGOS = Object.keys(PATHS_DEPARTAMENTOS)

function posicionDel(
  departamento: string | null,
  lon: number | null,
  lat: number | null
): readonly [number, number] | null {
  if (lon !== null && lat !== null) {
    return proyectar(
      [lon, lat],
      departamento === SAN_ANDRES
        ? PROYECCION_SAN_ANDRES
        : PROYECCION_CONTINENTAL
    )
  }
  return departamento ? (CENTROS_DEPARTAMENTOS[departamento] ?? null) : null
}

/**
 * Ubicación de un medio sobre el mapa SVG de Colombia (sin Mapbox, se pinta
 * en el servidor): su departamento resaltado, los departamentos donde AMO le
 * reconoce pertinencia geográfica en un tono más suave y un punto en la
 * cabecera municipal.
 */
export function MapaUbicacion({
  departamento,
  pertinencia,
  lon,
  lat,
  etiqueta,
  className,
}: {
  departamento: string | null
  /** Departamentos con pertinencia geográfica reconocida. */
  pertinencia: ReadonlySet<string>
  lon: number | null
  lat: number | null
  /** Nombre accesible ("Ubicación: Pasto, Nariño"). */
  etiqueta: string
  className?: string
}) {
  const punto = posicionDel(departamento, lon, lat)
  return (
    <svg
      viewBox={VIEWBOX_COLOMBIA}
      role="img"
      aria-label={etiqueta}
      className={cn("h-auto w-full", className)}
    >
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
      {CODIGOS.map((codigo) => (
        <path
          key={codigo}
          d={PATHS_DEPARTAMENTOS[codigo]}
          strokeWidth={codigo === departamento ? 2.5 : 1.25}
          className={cn(
            "stroke-background",
            codigo === departamento
              ? "fill-primary stroke-foreground/70"
              : pertinencia.has(codigo)
                ? "fill-primary/35"
                : "fill-muted-foreground/15"
          )}
        />
      ))}
      {punto ? (
        <g transform={`translate(${punto[0]} ${punto[1]})`}>
          <circle
            r={26}
            className="fill-primary/25 motion-safe:animate-pulse"
          />
          <circle r={11} className="fill-background" />
          <circle r={7} className="fill-foreground" />
        </g>
      ) : null}
    </svg>
  )
}
