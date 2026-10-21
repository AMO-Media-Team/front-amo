"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

import {
  DEFINICIONES_METRICAS,
  type MetricaGeo,
  METRICAS_GEO,
} from "../metricas"
import { ICONOS_METRICA } from "./iconos-metrica"

interface SelectorMetricaProps {
  metrica: MetricaGeo
  opciones: readonly MetricaGeo[]
  onCambiar: (metrica: MetricaGeo) => void
  className?: string
}

function esMetrica(valor: unknown): valor is MetricaGeo {
  return METRICAS_GEO.includes(valor as MetricaGeo)
}

function EtiquetaMetrica({ metrica }: { metrica: MetricaGeo }) {
  const Icono = ICONOS_METRICA[metrica]
  return (
    <>
      <Icono aria-hidden className="text-primary" />
      <span className="truncate">{DEFINICIONES_METRICAS[metrica].titulo}</span>
    </>
  )
}

/** Métrica del mapa; las opciones dependen del nivel y de los permisos. */
export function SelectorMetrica({
  metrica,
  opciones,
  onCambiar,
  className,
}: SelectorMetricaProps) {
  return (
    <Select
      value={metrica}
      onValueChange={(valor) => {
        if (esMetrica(valor)) onCambiar(valor)
      }}
      items={opciones.map((opcion) => ({
        value: opcion,
        label: DEFINICIONES_METRICAS[opcion].titulo,
      }))}
    >
      <SelectTrigger
        aria-label="Métrica del mapa"
        className={cn(
          "h-9 min-w-0 gap-2 rounded-xl border-transparent bg-foreground/5 pl-3 font-medium shadow-none hover:bg-foreground/8 dark:bg-foreground/5 dark:hover:bg-foreground/10",
          className
        )}
      >
        <SelectValue>
          {(valor: unknown) =>
            esMetrica(valor) ? <EtiquetaMetrica metrica={valor} /> : null
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        className="min-w-64"
        alignItemWithTrigger={false}
        align="start"
      >
        {opciones.map((opcion) => (
          <SelectItem key={opcion} value={opcion} className="py-2">
            <EtiquetaMetrica metrica={opcion} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
