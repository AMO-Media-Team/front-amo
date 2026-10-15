"use client"

import { FlaskConical } from "lucide-react"

import type { RangoFechas } from "@/lib/fechas"
import { cn } from "@/lib/utils"

import type { MetricaGeo } from "../metricas"
import type { EstadoNivel } from "../niveles"
import {
  AccionesMapa,
  MenuAccionesMapa,
  type OpcionesVista,
} from "./controles-mapa"
import { CLASE_PANEL } from "./lienzo"
import { BotonSubirNivel, MigasMapa } from "./migas-mapa"
import { SelectorMetrica } from "./selector-metrica"
import { SelectorPeriodo } from "./selector-periodo"

export interface PropsBarraMapa {
  estado: EstadoNivel
  onIr: (destino: EstadoNivel) => void
  metrica: MetricaGeo
  metricas: readonly MetricaGeo[]
  onMetrica: (metrica: MetricaGeo) => void
  rango: RangoFechas
  onRango: (rango: RangoFechas) => void
  opciones: OpcionesVista
  /** Los datos vienen del proveedor simulado (solo en desarrollo). */
  simulado: boolean
  /** Barra fina de progreso mientras se consultan datos. */
  cargando: boolean
}

function BarraProgreso({ activa }: { activa: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-3 bottom-0 h-px overflow-hidden rounded-full transition-opacity duration-300",
        activa ? "opacity-100" : "opacity-0"
      )}
    >
      <span className="block size-full animate-brillo-shimmer bg-[linear-gradient(90deg,transparent,var(--primary),transparent)] bg-size-[50%_100%] bg-no-repeat [animation-direction:reverse] motion-reduce:animate-none motion-reduce:bg-primary/60" />
    </span>
  )
}

function InsigniaSimulado({ compacta = false }: { compacta?: boolean }) {
  return (
    <span
      title="AMO_GEO_MOCK=1: cifras deterministas para desarrollo"
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/12 text-[0.625rem] font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-300",
        compacta ? "p-1.5" : "px-2 py-0.5"
      )}
    >
      <FlaskConical aria-hidden className="size-3" />
      <span className={cn(compacta && "sr-only")}>Simulado</span>
    </span>
  )
}

/** Encabezado del explorador en escritorio: título (h1) y migas del nivel. */
export function EncabezadoMapa({
  estado,
  onIr,
  simulado,
  cargando,
  className,
}: Pick<PropsBarraMapa, "estado" | "onIr" | "simulado" | "cargando"> & {
  className?: string
}) {
  return (
    <div
      className={cn(
        CLASE_PANEL,
        "relative flex flex-col gap-1.5 px-3.5 pt-3 pb-2.5",
        className
      )}
    >
      <div className="flex min-h-7 items-center gap-2 pl-1.5">
        <h1 className="text-[0.9375rem] leading-tight font-bold">
          Explorador geográfico
        </h1>
        {simulado ? <InsigniaSimulado /> : null}
        <BotonSubirNivel
          estado={estado}
          onIr={onIr}
          compacto
          className="-my-1 -mr-1.5 ml-auto"
        />
      </div>
      <MigasMapa
        estado={estado}
        onIr={onIr}
        conSubir={false}
        className="-ml-0.5"
      />
      <BarraProgreso activa={cargando} />
    </div>
  )
}

/** Métrica, periodo, vistas y acciones (escritorio). */
export function HerramientasMapa({
  metrica,
  metricas,
  onMetrica,
  rango,
  onRango,
  opciones,
  className,
}: Pick<
  PropsBarraMapa,
  "metrica" | "metricas" | "onMetrica" | "rango" | "onRango" | "opciones"
> & { className?: string }) {
  return (
    <div
      role="group"
      aria-label="Opciones del mapa"
      className={cn(CLASE_PANEL, "flex items-center gap-1.5 p-1.5", className)}
    >
      <SelectorMetrica
        metrica={metrica}
        opciones={metricas}
        onCambiar={onMetrica}
        className="w-60"
      />
      <SelectorPeriodo rango={rango} onCambiar={onRango} className="max-w-56" />
      <span aria-hidden className="mx-0.5 h-5 w-px bg-foreground/10" />
      <AccionesMapa opciones={opciones} />
    </div>
  )
}

/** Barra única para pantallas estrechas: migas + menú, y métrica + periodo. */
export function BarraCompacta({
  estado,
  onIr,
  metrica,
  metricas,
  onMetrica,
  rango,
  onRango,
  opciones,
  simulado,
  cargando,
  className,
}: PropsBarraMapa & { className?: string }) {
  return (
    <div
      className={cn(CLASE_PANEL, "relative flex flex-col gap-2 p-2", className)}
    >
      <h1 className="sr-only">Explorador geográfico</h1>
      <div className="flex items-center gap-1">
        <MigasMapa
          estado={estado}
          onIr={onIr}
          compacto
          className="min-w-0 flex-1 pl-0.5"
        />
        {simulado ? <InsigniaSimulado compacta /> : null}
        <MenuAccionesMapa opciones={opciones} />
      </div>
      <div className="flex items-center gap-1.5">
        <SelectorMetrica
          metrica={metrica}
          opciones={metricas}
          onCambiar={onMetrica}
          className="min-w-0 flex-1"
        />
        <SelectorPeriodo
          rango={rango}
          onCambiar={onRango}
          compacto
          className="max-w-[60%] shrink-0"
        />
      </div>
      <BarraProgreso activa={cargando} />
    </div>
  )
}
