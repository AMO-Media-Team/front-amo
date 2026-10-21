"use client"

import {
  Banknote,
  Building2,
  CircleDollarSign,
  Clapperboard,
  Coins,
  Eye,
  Gauge,
  Handshake,
  Heart,
  type LucideIcon,
  Megaphone,
  MousePointerClick,
  Percent,
  RadioTower,
  Radar,
  ShieldCheck,
  Target,
  Users,
  Wallet,
} from "lucide-react"
import type { CSSProperties } from "react"

import { Esqueleto } from "@/components/feedback/esqueletos"
import { propsDesdeFila } from "@/components/kpi/desde-fila"
import { RejillaKpi } from "@/components/kpi/rejilla-kpi"
import { TarjetaKpi } from "@/components/kpi/tarjeta-kpi"
import type { FilaKpi } from "@/components/kpi/tipos"
import { cn } from "@/lib/utils"

import type {
  DatoSecundario,
  DefinicionTarjeta,
  NombreIconoKpi,
} from "../tarjetas"

/** Iconos por nombre: un componente no viaja del servidor al cliente. */
const ICONOS = {
  alcance: Radar,
  anunciantes: Building2,
  campanas: Megaphone,
  clics: MousePointerClick,
  comision: Coins,
  costo: Target,
  cumplimiento: ShieldCheck,
  dinero: CircleDollarSign,
  engagement: Heart,
  impresiones: Eye,
  inversion: Wallet,
  llenado: Gauge,
  medios: RadioTower,
  negocios: Handshake,
  pago: Banknote,
  porcentaje: Percent,
  reproducciones: Clapperboard,
  usuarios: Users,
} as const satisfies Record<NombreIconoKpi, LucideIcon>

const TONO_SECUNDARIO = {
  neutro: "text-foreground",
  aviso: "text-warning",
} as const

function Secundario({ dato }: { dato: DatoSecundario }) {
  return (
    <dl className="flex h-8.5 min-w-0 items-center justify-between gap-2 border-t border-dashed px-3.5 text-xs sm:px-4">
      <dt
        className="truncate text-muted-foreground"
        title={dato.titulo ?? dato.etiqueta}
      >
        {dato.titulo ? (
          <>
            <span aria-hidden>{dato.etiqueta}</span>
            <span className="sr-only">{dato.titulo}</span>
          </>
        ) : (
          dato.etiqueta
        )}
      </dt>
      <dd
        className={cn(
          "shrink-0 font-medium cifras",
          TONO_SECUNDARIO[dato.tono ?? "neutro"]
        )}
      >
        {dato.valor}
      </dd>
    </dl>
  )
}

/**
 * Ocho tarjetas en filas pares: 2 columnas, y 4 cuando el panel mide al menos
 * 56 rem (cada tarjeta, ≥ 212 px). Depende del ancho del panel y no del de la
 * ventana: a 1024 px con la barra lateral abierta, 4 columnas dejarían cada
 * tarjeta en ~165 px, con títulos, comparativo y dato secundario cortados.
 * Los `md:`/`lg:` solo anulan las columnas por ventana de `RejillaKpi`.
 */
const COLUMNAS = "md:grid-cols-2 lg:grid-cols-2 @4xl/panel:grid-cols-4"

const MARCO =
  "flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card transition-[border-color,box-shadow] duration-300 hover:border-foreground/15"

/**
 * Fila de indicadores del panel: `TarjetaKpi` (cifra animada, variación con
 * color según el sentido, sparkline, definición y muestra mínima) más una
 * línea secundaria opcional con el dato que le da contexto.
 */
export function TarjetasKpi({
  etiqueta,
  filas,
  tarjetas,
  nMinimo,
  razones = "agregadas",
  etiquetaComparacion,
  className,
}: {
  etiqueta: string
  filas: readonly FilaKpi[]
  tarjetas: readonly DefinicionTarjeta[]
  nMinimo: number
  /**
   * `agregadas` (panel general): la RPC oculta la tasa con menos de `nMinimo`
   * casos y la tarjeta lo dice («se necesitan 20»). `propias` (una sola
   * entidad, como el anunciante): la tasa llega siempre con su n
   * (docs/kpis.md §0.4), así que una tasa sin valor es que no hubo datos, no
   * que falte muestra.
   */
  razones?: "agregadas" | "propias"
  etiquetaComparacion: string
  className?: string
}) {
  const porClave = new Map(filas.map((fila) => [fila.kpi, fila]))
  const conSecundario = tarjetas.some((tarjeta) => tarjeta.secundario)
  return (
    <RejillaKpi etiqueta={etiqueta} className={cn(COLUMNAS, className)}>
      {/* Las tarjetas titulan con h3: sin este h2 la página saltaría de h1 a h3. */}
      <h2 className="sr-only">{etiqueta}</h2>
      {tarjetas.map((tarjeta, indice) => {
        const fila = porClave.get(tarjeta.kpi) ?? filaVacia(tarjeta.kpi)
        const props = propsDesdeFila(fila, nMinimo)
        const estilo: CSSProperties = { animationDelay: `${indice * 55}ms` }
        return (
          <div
            key={tarjeta.kpi}
            className={cn(
              MARCO,
              "animate-aparecer-arriba motion-reduce:animate-none"
            )}
            style={estilo}
          >
            <TarjetaKpi
              {...props}
              nMinimo={
                razones === "propias" && fila.valor === null
                  ? undefined
                  : props.nMinimo
              }
              titulo={tarjeta.titulo ?? props.titulo}
              icono={ICONOS[tarjeta.icono]}
              etiquetaComparacion={etiquetaComparacion}
              className="flex-1 animate-none rounded-none border-0 bg-transparent"
            />
            {tarjeta.secundario ? (
              <Secundario dato={tarjeta.secundario} />
            ) : conSecundario ? (
              // Misma altura en toda la fila aunque esta tarjeta no tenga dato.
              <div aria-hidden className="h-8.5 border-t border-dashed" />
            ) : null}
          </div>
        )
      })}
    </RejillaKpi>
  )
}

function filaVacia(kpi: string): FilaKpi {
  return {
    kpi,
    valor: null,
    valor_anterior: null,
    variacion: null,
    n: null,
    unidad: "conteo",
    serie: null,
  }
}

/** Fallback fiel de `TarjetasKpi` (con o sin línea secundaria). */
export function EsqueletoTarjetasKpi({
  cantidad = 8,
  conSecundario = true,
  className,
}: {
  cantidad?: number
  conSecundario?: boolean
  className?: string
}) {
  return (
    <RejillaKpi
      etiqueta="Cargando indicadores"
      className={cn(COLUMNAS, className)}
    >
      {Array.from({ length: cantidad }, (_, i) => (
        <div key={i} className={MARCO}>
          <TarjetaKpi
            titulo="Indicador"
            valor={null}
            cargando
            indice={i}
            className="flex-1 rounded-none border-0 bg-transparent"
          />
          {conSecundario ? (
            <div className="flex h-8.5 items-center justify-between border-t border-dashed px-3.5 sm:px-4">
              <Esqueleto className="h-3 w-16" />
              <Esqueleto className="h-3 w-12" />
            </div>
          ) : null}
        </div>
      ))}
    </RejillaKpi>
  )
}
