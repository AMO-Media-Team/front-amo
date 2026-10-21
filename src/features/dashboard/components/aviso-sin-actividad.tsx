"use client"

import { CalendarSearch } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ETIQUETAS_PRESET, type PresetAutomatico } from "@/lib/fechas"
import { cn } from "@/lib/utils"

import { rangoPanel, valoresParaPreset } from "../periodo"
import { ID_SELECTOR_PERIODO, usePeriodoPanel } from "./proveedor-periodo"

/** El periodo más amplio del selector: la salida cuando el elegido está vacío. */
const PRESET_AMPLIO: PresetAutomatico = "esteAno"

/**
 * Aviso sobre los indicadores cuando el periodo no registró ningún hecho:
 * explica por qué todo está en cero (no es un error) y ofrece ampliar el
 * periodo en un toque. Sin él, el panel vacío es una pared de «sin datos».
 */
export function AvisoSinActividad({
  detalle,
  className,
}: {
  /** Qué faltó en el periodo ("negocios, ofertas ni medios activos"). */
  detalle: string
  className?: string
}) {
  const { valores, porDefecto, fijar, actualizando } = usePeriodoPanel()
  const rango = rangoPanel(valores, porDefecto)
  const ampliable = rango.preset !== PRESET_AMPLIO

  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-dashed bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
        >
          <CalendarSearch className="size-4.5" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-semibold">Sin actividad en este periodo</p>
          <p className="text-[0.8125rem] text-muted-foreground">
            No hubo {detalle} en estas fechas.
            {ampliable ? " Prueba con un periodo más amplio." : null}
          </p>
        </div>
      </div>
      {ampliable ? (
        <Button
          variant="outline"
          size="sm"
          disabled={actualizando}
          onClick={() => {
            fijar(valoresParaPreset(PRESET_AMPLIO, porDefecto))
            // Este botón desaparece con el cambio: el foco pasa al selector,
            // que ya muestra el periodo nuevo, en vez de perderse.
            document.getElementById(ID_SELECTOR_PERIODO)?.focus()
          }}
          className="shrink-0 max-sm:w-full"
        >
          Ver {ETIQUETAS_PRESET[PRESET_AMPLIO].toLocaleLowerCase("es-CO")}
        </Button>
      ) : null}
    </div>
  )
}
