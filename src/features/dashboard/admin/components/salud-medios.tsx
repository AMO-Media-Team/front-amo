import {
  Activity,
  Ban,
  HeartPulse,
  type LucideIcon,
  MoonStar,
  RadioTower,
  Sparkles,
  TriangleAlert,
} from "lucide-react"

import type { Route } from "next"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import {
  formatearCOPCompacto,
  formatearNumero,
  formatearPorcentaje,
  formatearRelativo,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import { TarjetaPanel } from "../../components/tarjeta-panel"
import type { FilaSalud, MedioEnRiesgo, SegmentoSalud } from "../datos"

interface EstiloSegmento {
  etiqueta: string
  descripcion: string
  Icono: LucideIcon
  /** Chip del icono y relleno de la barra (estado: nunca solo color). */
  chip: string
  barra: string
}

const SEGMENTOS: Readonly<Record<SegmentoSalud, EstiloSegmento>> = {
  activos: {
    etiqueta: "Activos",
    descripcion: "Aceptaron o publicaron en el periodo",
    Icono: Activity,
    chip: "bg-success/12 text-success",
    barra: "bg-success",
  },
  nuevos: {
    etiqueta: "Nuevos",
    descripcion: "Verificados por primera vez",
    Icono: Sparkles,
    chip: "bg-info/12 text-info",
    barra: "bg-info",
  },
  en_riesgo: {
    etiqueta: "En riesgo",
    descripcion: "Activos en 90 días, sin aceptar en 30",
    Icono: TriangleAlert,
    chip: "bg-warning/10 text-warning",
    barra: "bg-warning",
  },
  inactivos: {
    etiqueta: "Inactivos",
    descripcion: "Sin aceptaciones en 90 días",
    Icono: MoonStar,
    chip: "bg-muted text-muted-foreground",
    barra: "bg-muted-foreground/60",
  },
  suspendidos: {
    etiqueta: "Suspendidos",
    descripcion: "Fuera del marketplace",
    Icono: Ban,
    chip: "bg-destructive/12 text-destructive",
    barra: "bg-destructive",
  },
}

function FilaSegmento({ fila }: { fila: FilaSalud }) {
  const { etiqueta, descripcion, Icono, chip, barra } = SEGMENTOS[fila.segmento]
  const porcentaje = fila.porcentaje ?? 0
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
      <span
        aria-hidden
        className={cn("grid size-8 place-items-center rounded-lg", chip)}
      >
        <Icono className="size-4" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[0.8125rem] font-medium">{etiqueta}</span>
        <span className="truncate text-[0.6875rem] text-muted-foreground">
          {descripcion}
        </span>
      </span>
      <span className="flex flex-col items-end">
        <span className="text-base leading-tight font-semibold cifras">
          {formatearNumero(fila.cantidad)}
        </span>
        <span className="text-[0.6875rem] cifras text-muted-foreground">
          {fila.porcentaje === null ? "—" : formatearPorcentaje(porcentaje, 0)}
        </span>
      </span>
      <span
        aria-hidden
        className="col-span-2 col-start-2 h-1 overflow-hidden rounded-full bg-muted"
      >
        <span
          className={cn("block h-full rounded-full", barra)}
          style={{ width: `${Math.min(100, porcentaje * 100)}%` }}
        />
      </span>
    </li>
  )
}

/**
 * Salud del inventario de medios al cierre del periodo (segmentos no
 * excluyentes, sobre los medios verificados o suspendidos) y los medios en
 * riesgo con más GMV en juego.
 */
export function SaludMedios({
  segmentos,
  base,
  enRiesgo,
  periodoVigente = true,
  enlaceRiesgo,
  ahora,
  className,
}: {
  segmentos: readonly FilaSalud[]
  base: number | null
  /** Medios en riesgo HOY (`medios_en_riesgo`), por GMV en juego. */
  enRiesgo: readonly MedioEnRiesgo[]
  /**
   * ¿El periodo termina hoy? Los segmentos son del cierre del periodo y la
   * lista, de hoy: si no coinciden, la lista se rotula «hoy» y no lleva el
   * GMV en juego del segmento (es de otra fecha).
   */
  periodoVigente?: boolean
  /** Con `medios.ver`: la lista de medios en riesgo. */
  enlaceRiesgo?: Route
  ahora: Date
  className?: string
}) {
  const sinMedios = segmentos.every((fila) => fila.cantidad === 0)
  const riesgo = segmentos.find((fila) => fila.segmento === "en_riesgo")
  const hayRiesgo = (riesgo?.cantidad ?? 0) > 0 || enRiesgo.length > 0
  return (
    <TarjetaPanel
      titulo="Salud de los medios"
      descripcion="Estado del inventario al cierre del periodo."
      icono={HeartPulse}
      className={className}
      enlace={
        enlaceRiesgo && hayRiesgo
          ? { href: enlaceRiesgo, texto: "Ver medios en riesgo" }
          : undefined
      }
      pie={
        base !== null && !sinMedios
          ? `Porcentajes sobre ${formatearNumero(base)} medios verificados o suspendidos; un medio puede estar en varios grupos.`
          : null
      }
    >
      {sinMedios ? (
        <EstadoVacio
          variante="simple"
          icono={RadioTower}
          titulo="Aún no hay medios verificados"
          descripcion="Cuando se verifiquen medios verás su actividad y quiénes están en riesgo."
          className="h-full py-6"
        />
      ) : (
        <div className="flex flex-col gap-5">
          <ul
            className="flex flex-col gap-3.5"
            aria-label="Segmentos de medios"
          >
            {segmentos.map((fila) => (
              <FilaSegmento key={fila.segmento} fila={fila} />
            ))}
          </ul>
          {enRiesgo.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-lg border border-warning/25 bg-warning/5 p-3">
              <p className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-warning">
                  {periodoVigente
                    ? "En riesgo con más GMV"
                    : "En riesgo hoy, con más GMV"}
                </span>
                {periodoVigente && riesgo && riesgo.gmvEnJuego > 0 ? (
                  <span className="cifras text-muted-foreground">
                    {formatearCOPCompacto(riesgo.gmvEnJuego)} en juego
                  </span>
                ) : null}
              </p>
              <ul className="flex flex-col gap-1.5">
                {enRiesgo.slice(0, 3).map((medio) => (
                  <li
                    key={medio.id}
                    className="flex items-baseline justify-between gap-3 text-[0.8125rem]"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">
                        {medio.nombre}
                      </span>
                      <span className="truncate text-[0.6875rem] text-muted-foreground">
                        {[
                          medio.departamento,
                          medio.ultimaAceptacionAt
                            ? `aceptó ${formatearRelativo(medio.ultimaAceptacionAt, ahora)}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold cifras">
                      {formatearCOPCompacto(medio.gmv90d)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </TarjetaPanel>
  )
}
