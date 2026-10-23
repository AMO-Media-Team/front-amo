"use client"

import { CalendarDays, ChevronDown } from "lucide-react"
import { type ReactNode, useId, useState } from "react"
import { es } from "react-day-picker/locale"
import { Controller, type FieldValues, useFormContext } from "react-hook-form"

import {
  claseCeldaCalendario,
  CLASES_CALENDARIO,
} from "@/components/filtros/selector-periodo"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  FieldDescription,
  FieldError,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useIsMobile } from "@/hooks/use-mobile"
import { parsearFecha, ZONA } from "@/lib/fechas"
import { formatearFecha } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  combinarFechaHora,
  type DiaYHora,
  separarFechaHora,
} from "../instantes"

export interface PropsCampoFechaHora {
  /** Ruta del campo (ISO UTC o '' sin elegir). */
  nombre: string
  etiqueta: string
  descripcion?: ReactNode
  /** Primer y último día elegibles en el calendario ('YYYY-MM-DD' de Bogotá). */
  diaMinimo?: string
  diaMaximo?: string
  /** Hora que se propone al elegir el día si aún no hay una ('HH:mm'). */
  horaPorDefecto?: string
  deshabilitado?: boolean
  className?: string
}

/**
 * Día y hora de Colombia en un solo valor (`timestamptz`): un calendario para
 * el día y un campo de hora. Mientras falte uno de los dos el valor queda
 * vacío (y la validación lo pide). El grupo lleva la etiqueta como leyenda;
 * cada control dice si es el día o la hora y, el del día, cuál está elegido.
 */
export function CampoFechaHora({
  nombre,
  etiqueta,
  descripcion,
  diaMinimo,
  diaMaximo,
  horaPorDefecto = "08:00",
  deshabilitado,
  className,
}: PropsCampoFechaHora) {
  const { control } = useFormContext<FieldValues>()
  return (
    <Controller
      control={control}
      name={nombre}
      render={({ field, fieldState }) => (
        <SelectorFechaHora
          valor={typeof field.value === "string" ? field.value : ""}
          onCambio={(valor) => field.onChange(valor)}
          onSalir={field.onBlur}
          referencia={field.ref}
          error={fieldState.error?.message}
          etiqueta={etiqueta}
          descripcion={descripcion}
          diaMinimo={diaMinimo}
          diaMaximo={diaMaximo}
          horaPorDefecto={horaPorDefecto}
          deshabilitado={deshabilitado}
          className={className}
        />
      )}
    />
  )
}

interface PropsSelector extends Omit<
  PropsCampoFechaHora,
  "nombre" | "horaPorDefecto"
> {
  valor: string
  onCambio: (valor: string) => void
  onSalir: () => void
  referencia: (elemento: HTMLElement | null) => void
  error?: string
  horaPorDefecto: string
}

function SelectorFechaHora({
  valor,
  onCambio,
  onSalir,
  referencia,
  error,
  etiqueta,
  descripcion,
  diaMinimo,
  diaMaximo,
  horaPorDefecto,
  deshabilitado,
  className,
}: PropsSelector) {
  const base = useId()
  const ids = {
    dia: `${base}-dia`,
    etiquetaDia: `${base}-etiqueta-dia`,
    valorDia: `${base}-valor-dia`,
    hora: `${base}-hora`,
    ayuda: `${base}-ayuda`,
    error: `${base}-error`,
  }
  const [abierto, setAbierto] = useState(false)
  const esMovil = useIsMobile()
  // Lo escrito a medias (día sin hora) vive aquí; el valor solo cambia completo.
  const [previo, setPrevio] = useState(valor)
  const [partes, setPartes] = useState<DiaYHora>(() => separarFechaHora(valor))
  if (valor !== previo) {
    setPrevio(valor)
    if (valor) setPartes(separarFechaHora(valor))
  }

  function cambiar(siguientes: DiaYHora) {
    setPartes(siguientes)
    onCambio(combinarFechaHora(siguientes.dia, siguientes.hora) ?? "")
  }

  const fecha = parsearFecha(partes.dia)
  const minimo = parsearFecha(diaMinimo)
  const maximo = parsearFecha(diaMaximo)
  const invalido = Boolean(error)
  const describedBy =
    [descripcion ? ids.ayuda : null, invalido ? ids.error : null]
      .filter(Boolean)
      .join(" ") || undefined
  const deshabilitados = [
    ...(minimo ? [{ before: minimo }] : []),
    ...(maximo ? [{ after: maximo }] : []),
  ]

  return (
    <FieldSet
      data-invalid={invalido || undefined}
      className={cn("gap-2", className)}
    >
      <FieldLegend variant="label" className="mb-0">
        {etiqueta}
      </FieldLegend>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9.5rem]">
        <div className="flex min-w-0 flex-col gap-1">
          <Label
            id={ids.etiquetaDia}
            htmlFor={ids.dia}
            className="text-xs font-normal text-muted-foreground"
          >
            Día
          </Label>
          <Popover
            open={abierto}
            onOpenChange={(abrir) => {
              setAbierto(abrir)
              if (!abrir) onSalir()
            }}
          >
            <PopoverTrigger
              render={
                <Button
                  id={ids.dia}
                  ref={referencia}
                  type="button"
                  variant="outline"
                  disabled={deshabilitado}
                  aria-invalid={invalido || undefined}
                  aria-labelledby={`${ids.etiquetaDia} ${ids.valorDia}`}
                  aria-describedby={describedBy}
                  className="min-w-0 justify-start font-normal"
                />
              }
            >
              <CalendarDays data-icon="inline-start" aria-hidden />
              <span
                id={ids.valorDia}
                className={cn(
                  "truncate cifras",
                  !fecha && "text-muted-foreground"
                )}
              >
                {fecha ? formatearFecha(fecha, "medio") : "Elige el día"}
              </span>
              <ChevronDown
                data-icon="inline-end"
                aria-hidden
                className="ml-auto opacity-60"
              />
            </PopoverTrigger>
            <PopoverContent
              align="start"
              aria-label={`Elegir el día: ${etiqueta}`}
              className="w-auto max-w-[calc(100vw-2rem)] p-0"
            >
              <Calendar
                mode="single"
                locale={es}
                timeZone={ZONA}
                selected={fecha ?? undefined}
                defaultMonth={fecha ?? minimo ?? undefined}
                startMonth={minimo ?? undefined}
                endMonth={maximo ?? undefined}
                disabled={deshabilitados.length ? deshabilitados : undefined}
                onSelect={(dia) => {
                  if (!dia) return
                  const elegido = separarFechaHora(dia.toISOString()).dia
                  cambiar({ dia: elegido, hora: partes.hora || horaPorDefecto })
                  setAbierto(false)
                  onSalir()
                }}
                classNames={{ today: CLASES_CALENDARIO.today }}
                className={cn("p-3", claseCeldaCalendario(esMovil))}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Label
            htmlFor={ids.hora}
            className="text-xs font-normal text-muted-foreground"
          >
            Hora
          </Label>
          <Input
            id={ids.hora}
            type="time"
            value={partes.hora}
            onChange={(evento) =>
              cambiar({ dia: partes.dia, hora: evento.target.value })
            }
            onBlur={onSalir}
            disabled={deshabilitado}
            aria-invalid={invalido || undefined}
            aria-describedby={describedBy}
            className="cifras"
          />
        </div>
      </div>
      {descripcion ? (
        <FieldDescription id={ids.ayuda}>{descripcion}</FieldDescription>
      ) : null}
      <FieldError id={ids.error} errors={error ? [{ message: error }] : []} />
    </FieldSet>
  )
}
