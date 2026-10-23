"use client"

import { CalendarDays, ChevronDown } from "lucide-react"
import { useState } from "react"
import type { DateRange } from "react-day-picker"
import { es } from "react-day-picker/locale"

import {
  BotonOpcionPeriodo,
  CLASE_TRAMO_CALENDARIO,
  CLASES_CALENDARIO,
  claseCeldaCalendario,
} from "@/components/filtros/selector-periodo"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { etiquetaRango } from "@/features/auditoria/periodo"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  inicioDelDia,
  parsearFecha,
  rangoPersonalizado,
  serializarFecha,
  ZONA,
} from "@/lib/fechas"
import { cn } from "@/lib/utils"

import {
  type DiasPublicacion,
  diasDeOpcion,
  ETIQUETAS_PUBLICACION,
  etiquetaPublicacion,
  OPCIONES_PUBLICACION,
  opcionActivaPublicacion,
  SIN_DIAS_PUBLICACION,
} from "../publicacion"

/**
 * Días de publicación del marketplace (`?desde=&hasta=`): opciones rápidas
 * hacia adelante («Hoy», «Esta semana»…), «Cualquier día» para quitar el
 * filtro y un tramo del calendario desde hoy (uno o dos meses según el
 * ancho). El tramo solo se aplica con «Aplicar»; cada apertura parte de lo
 * elegido. Deja las ofertas cuya ventana de publicación toca alguno de esos
 * días.
 */
export function SelectorPublicacion({
  dias,
  onCambiar,
  cargando = false,
  id,
  className,
}: {
  dias: DiasPublicacion
  /** Días elegidos; `{ desde: null, hasta: null }` quita el filtro. */
  onCambiar: (dias: DiasPublicacion) => void
  cargando?: boolean
  id?: string
  className?: string
}) {
  const esMovil = useIsMobile()
  const [abierto, setAbierto] = useState(false)
  const [borrador, setBorrador] = useState<DateRange | undefined>()

  const ahora = new Date()
  const hoy = inicioDelDia(ahora)
  const etiqueta = etiquetaPublicacion(dias, ahora)
  const activa = opcionActivaPublicacion(dias, ahora)
  const sinDias = dias.desde === null && dias.hasta === null

  function cambiarAbierto(siguiente: boolean) {
    if (siguiente) {
      const desde = parsearFecha(dias.desde)
      const hasta = parsearFecha(dias.hasta)
      const inicio = desde ?? hasta
      setBorrador(inicio ? { from: inicio, to: hasta ?? inicio } : undefined)
    }
    setAbierto(siguiente)
  }

  function elegir(siguiente: DiasPublicacion) {
    onCambiar(siguiente)
    setAbierto(false)
  }

  const elegido = borrador?.from
    ? rangoPersonalizado(borrador.from, borrador.to ?? borrador.from)
    : null

  function aplicarTramo() {
    if (!elegido) return
    elegir({
      desde: serializarFecha(elegido.desde),
      hasta: serializarFecha(elegido.hasta),
    })
  }

  return (
    <Popover open={abierto} onOpenChange={cambiarAbierto}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            variant="outline"
            className={cn(
              "h-9 w-full min-w-0 justify-start rounded-lg bg-card font-normal dark:bg-input/30",
              className
            )}
          />
        }
        aria-label={`Días de publicación: ${etiqueta}`}
      >
        {cargando ? (
          <Spinner data-icon="inline-start" aria-hidden />
        ) : (
          <CalendarDays
            data-icon="inline-start"
            aria-hidden
            className="text-muted-foreground"
          />
        )}
        <span className={cn("truncate", sinDias && "text-muted-foreground")}>
          {etiqueta}
        </span>
        <ChevronDown
          data-icon="inline-end"
          aria-hidden
          className="ml-auto opacity-60"
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label="Elegir los días de publicación"
        className="max-h-(--available-height) w-auto max-w-[calc(100vw-2rem)] gap-0 overflow-x-hidden overflow-y-auto p-0 max-sm:min-w-(--anchor-width)"
      >
        <div className="flex flex-col md:flex-row">
          <div
            role="group"
            aria-label="Días rápidos"
            className="grid grid-cols-2 gap-1 border-b p-2 md:flex md:w-44 md:flex-col md:border-r md:border-b-0"
          >
            <BotonOpcionPeriodo
              activa={sinDias}
              onElegir={() => elegir({ desde: null, hasta: null })}
            >
              {SIN_DIAS_PUBLICACION}
            </BotonOpcionPeriodo>
            {OPCIONES_PUBLICACION.map((opcion) => (
              <BotonOpcionPeriodo
                key={opcion}
                activa={activa === opcion}
                onElegir={() => elegir(diasDeOpcion(opcion, ahora))}
              >
                {ETIQUETAS_PUBLICACION[opcion]}
              </BotonOpcionPeriodo>
            ))}
          </div>
          <div className="flex min-w-0 flex-col">
            <p className="border-b px-3 py-2 text-xs text-muted-foreground">
              Ofertas que se pueden publicar en alguno de esos días.
            </p>
            <Calendar
              mode="range"
              locale={es}
              timeZone={ZONA}
              numberOfMonths={esMovil ? 1 : 2}
              defaultMonth={borrador?.from ?? hoy}
              selected={borrador}
              onSelect={setBorrador}
              disabled={{ before: hoy }}
              showOutsideDays={esMovil}
              classNames={CLASES_CALENDARIO}
              className={cn(
                "bg-transparent p-3",
                CLASE_TRAMO_CALENDARIO,
                claseCeldaCalendario(esMovil)
              )}
            />
            <div className="flex items-center justify-between gap-3 border-t px-3 py-2.5">
              <p
                className="min-w-0 truncate text-xs cifras text-muted-foreground"
                aria-live="polite"
              >
                {elegido
                  ? etiquetaRango(elegido)
                  : "Elige el primer y el último día"}
              </p>
              <Button size="sm" onClick={aplicarTramo} disabled={!elegido}>
                Aplicar
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
