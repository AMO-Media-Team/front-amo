"use client"

import { CalendarCheck, ChevronDown } from "lucide-react"
import { useState } from "react"
import { es } from "react-day-picker/locale"

import {
  BotonOpcionPeriodo,
  claseCeldaCalendario,
  CLASES_CALENDARIO,
} from "@/components/filtros/selector-periodo"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useIsMobile } from "@/hooks/use-mobile"
import { inicioDelDia, serializarFecha, ZONA } from "@/lib/fechas"
import { formatearFecha } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  CORTES_SUGERIDOS,
  ETIQUETAS_CORTE,
  fechaCorteSugerido,
  resolverCorte,
} from "../filtros"

interface SelectorCorteProps {
  /** `YYYY-MM-DD` de la URL; `null` = hoy. */
  valor: string | null
  onCambiar: (valor: string | null) => void
}

/**
 * Fecha de corte de la cartera: cierres habituales (hoy, fin de mes,
 * trimestre o año anterior) o cualquier día pasado del calendario.
 */
export function SelectorCorte({ valor, onCambiar }: SelectorCorteProps) {
  const esMovil = useIsMobile()
  const [abierto, setAbierto] = useState(false)
  const ahora = new Date()
  const hoy = inicioDelDia(ahora)
  const corte = resolverCorte(valor, ahora)
  const esHoy = corte.getTime() === hoy.getTime()

  function elegir(fecha: Date | undefined) {
    if (!fecha) return
    const dia = inicioDelDia(fecha)
    onCambiar(dia.getTime() === hoy.getTime() ? null : serializarFecha(dia))
    setAbierto(false)
  }

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className="min-w-0 justify-start bg-card dark:bg-input/30"
          />
        }
        aria-label={`Fecha de corte: ${formatearFecha(corte, "largo")}`}
      >
        <CalendarCheck data-icon="inline-start" aria-hidden />
        <span className="text-muted-foreground max-sm:sr-only">Corte</span>
        <span
          aria-hidden
          className="h-3.5 w-px shrink-0 bg-border max-sm:hidden"
        />
        <span className="truncate cifras">
          {esHoy ? "Hoy" : formatearFecha(corte, "medio")}
        </span>
        <ChevronDown
          data-icon="inline-end"
          aria-hidden
          className="opacity-60"
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        // El popover es un `dialog`: sin nombre, el lector solo dice «diálogo».
        aria-label="Elegir la fecha de corte"
        className="w-auto max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0"
      >
        <div className="flex flex-col md:flex-row">
          <div
            role="group"
            aria-label="Cortes habituales"
            className="grid grid-cols-2 gap-1 border-b p-2 md:flex md:w-52 md:flex-col md:border-r md:border-b-0"
          >
            {CORTES_SUGERIDOS.map((sugerido) => {
              const fecha = fechaCorteSugerido(sugerido, ahora)
              const activo = fecha.getTime() === corte.getTime()
              return (
                <BotonOpcionPeriodo
                  key={sugerido}
                  activa={activo}
                  onElegir={() => elegir(fecha)}
                >
                  <span className="flex flex-col">
                    {ETIQUETAS_CORTE[sugerido]}
                    <span className="text-[0.6875rem] font-normal cifras text-muted-foreground">
                      {formatearFecha(fecha, "medio")}
                    </span>
                  </span>
                </BotonOpcionPeriodo>
              )
            })}
          </div>
          <Calendar
            mode="single"
            locale={es}
            timeZone={ZONA}
            selected={corte}
            defaultMonth={corte}
            onSelect={elegir}
            disabled={{ after: hoy }}
            classNames={{ today: CLASES_CALENDARIO.today }}
            className={cn("bg-transparent p-3", claseCeldaCalendario(esMovil))}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
