"use client"

import { CalendarDays, ChevronDown, Plus, X } from "lucide-react"
import { type KeyboardEvent, type ReactNode, useId, useState } from "react"
import { es } from "react-day-picker/locale"
import {
  Controller,
  type FieldValues,
  useFormContext,
  useFormState,
} from "react-hook-form"

import {
  claseCeldaCalendario,
  CLASES_CALENDARIO,
} from "@/components/filtros/selector-periodo"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useIsMobile } from "@/hooks/use-mobile"
import { inicioDelDia, parsearFecha, serializarFecha, ZONA } from "@/lib/fechas"
import { formatearFecha } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * Campos de formulario enlazados a react-hook-form (dentro de un
 * `FormProvider`). Cada uno pinta su etiqueta, ayuda y error, y marca
 * `aria-invalid` para lectores de pantalla.
 */

interface PropsBase {
  nombre: string
  etiqueta: ReactNode
  descripcion?: ReactNode
  opcional?: boolean
  deshabilitado?: boolean
  className?: string
}

function useEstadoCampo(nombre: string) {
  const { control, getFieldState } = useFormContext<FieldValues>()
  const formState = useFormState({ control, name: nombre })
  return getFieldState(nombre, formState)
}

function Etiqueta({
  htmlFor,
  etiqueta,
  opcional,
}: {
  htmlFor: string
  etiqueta: ReactNode
  opcional?: boolean
}) {
  return (
    <FieldLabel htmlFor={htmlFor}>
      {etiqueta}
      {opcional ? (
        <span className="font-normal text-muted-foreground">(opcional)</span>
      ) : null}
    </FieldLabel>
  )
}

export function CampoTexto({
  nombre,
  etiqueta,
  descripcion,
  opcional,
  deshabilitado,
  className,
  placeholder,
  mayusculas = false,
  autoFocus,
}: PropsBase & {
  placeholder?: string
  mayusculas?: boolean
  autoFocus?: boolean
}) {
  const { register } = useFormContext<FieldValues>()
  const { error, invalid } = useEstadoCampo(nombre)
  const id = `${useId()}-${nombre}`
  return (
    <Field data-invalid={invalid || undefined} className={className}>
      <Etiqueta htmlFor={id} etiqueta={etiqueta} opcional={opcional} />
      <Input
        id={id}
        autoComplete="off"
        placeholder={placeholder}
        disabled={deshabilitado}
        autoFocus={autoFocus}
        autoCapitalize={mayusculas ? "characters" : undefined}
        aria-invalid={invalid || undefined}
        className={cn(mayusculas && "uppercase")}
        {...register(nombre)}
      />
      {descripcion ? <FieldDescription>{descripcion}</FieldDescription> : null}
      <FieldError errors={[error]} />
    </Field>
  )
}

/** Cifra escrita en es-CO ("1.250.000", "15,5") con prefijo o sufijo de unidad. */
export function CampoCifra({
  nombre,
  etiqueta,
  descripcion,
  opcional,
  deshabilitado,
  className,
  prefijo,
  sufijo,
  decimal = false,
  placeholder,
}: PropsBase & {
  prefijo?: string
  sufijo?: string
  decimal?: boolean
  placeholder?: string
}) {
  const { register } = useFormContext<FieldValues>()
  const { error, invalid } = useEstadoCampo(nombre)
  const id = `${useId()}-${nombre}`
  return (
    <Field data-invalid={invalid || undefined} className={className}>
      <Etiqueta htmlFor={id} etiqueta={etiqueta} opcional={opcional} />
      <InputGroup>
        {prefijo ? (
          <InputGroupAddon>
            <InputGroupText>{prefijo}</InputGroupText>
          </InputGroupAddon>
        ) : null}
        <InputGroupInput
          id={id}
          inputMode={decimal ? "decimal" : "numeric"}
          autoComplete="off"
          placeholder={placeholder}
          disabled={deshabilitado}
          aria-invalid={invalid || undefined}
          className="cifras"
          {...register(nombre)}
        />
        {sufijo ? (
          <InputGroupAddon align="inline-end">
            <InputGroupText>{sufijo}</InputGroupText>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      {descripcion ? <FieldDescription>{descripcion}</FieldDescription> : null}
      <FieldError errors={[error]} />
    </Field>
  )
}

export function CampoAreaTexto({
  nombre,
  etiqueta,
  descripcion,
  opcional,
  deshabilitado,
  className,
  filas = 4,
  placeholder,
  mono = false,
}: PropsBase & { filas?: number; placeholder?: string; mono?: boolean }) {
  const { register } = useFormContext<FieldValues>()
  const { error, invalid } = useEstadoCampo(nombre)
  const id = `${useId()}-${nombre}`
  return (
    <Field data-invalid={invalid || undefined} className={className}>
      <Etiqueta htmlFor={id} etiqueta={etiqueta} opcional={opcional} />
      {/* El área crece con el contenido (`field-sizing`): `filas` fija el alto mínimo. */}
      <Textarea
        id={id}
        rows={filas}
        placeholder={placeholder}
        disabled={deshabilitado}
        aria-invalid={invalid || undefined}
        style={{ minHeight: `calc(${filas}lh + 1rem + 2px)` }}
        className={cn(
          "max-h-[70vh] resize-y",
          mono && "font-mono text-[0.8125rem]"
        )}
        {...register(nombre)}
      />
      {descripcion ? <FieldDescription>{descripcion}</FieldDescription> : null}
      <FieldError errors={[error]} />
    </Field>
  )
}

/** Interruptor con su explicación al lado (verdadero/falso). */
export function CampoInterruptor({
  nombre,
  etiqueta,
  descripcion,
  deshabilitado,
  className,
}: PropsBase) {
  const { control } = useFormContext<FieldValues>()
  const id = `${useId()}-${nombre}`
  return (
    <Controller
      control={control}
      name={nombre}
      render={({ field }) => (
        <Field
          orientation="horizontal"
          className={cn("rounded-lg border bg-muted/20 p-3", className)}
        >
          <FieldContent>
            <FieldLabel htmlFor={id}>{etiqueta}</FieldLabel>
            {descripcion ? (
              <FieldDescription>{descripcion}</FieldDescription>
            ) : null}
          </FieldContent>
          <Switch
            id={id}
            checked={field.value === true}
            onCheckedChange={(valor) => field.onChange(valor)}
            disabled={deshabilitado}
          />
        </Field>
      )}
    />
  )
}

export interface OpcionCampo {
  valor: string
  etiqueta: string
}

export function CampoSelect({
  nombre,
  etiqueta,
  descripcion,
  deshabilitado,
  className,
  opciones,
  placeholder = "Elige una opción",
}: PropsBase & { opciones: readonly OpcionCampo[]; placeholder?: string }) {
  const { control } = useFormContext<FieldValues>()
  const id = `${useId()}-${nombre}`
  return (
    <Controller
      control={control}
      name={nombre}
      render={({ field, fieldState }) => (
        <Field
          data-invalid={fieldState.invalid || undefined}
          className={className}
        >
          <FieldLabel htmlFor={id}>{etiqueta}</FieldLabel>
          <Select
            value={field.value}
            onValueChange={(valor) => field.onChange(valor ?? "")}
            items={opciones.map((o) => ({ value: o.valor, label: o.etiqueta }))}
            disabled={deshabilitado}
          >
            <SelectTrigger
              id={id}
              className="w-full"
              aria-invalid={fieldState.invalid || undefined}
            >
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {opciones.map((opcion) => (
                <SelectItem key={opcion.valor} value={opcion.valor}>
                  {opcion.etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {descripcion ? (
            <FieldDescription>{descripcion}</FieldDescription>
          ) : null}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  )
}

/** Día de calendario en Bogotá ('YYYY-MM-DD'; '' sin fecha). */
export function CampoFecha({
  nombre,
  etiqueta,
  descripcion,
  opcional,
  deshabilitado,
  className,
  minimo,
  placeholder = "Elige una fecha",
}: PropsBase & {
  /** Primer día elegible ('YYYY-MM-DD'). */
  minimo?: string
  placeholder?: string
}) {
  const { control } = useFormContext<FieldValues>()
  const id = `${useId()}-${nombre}`
  const [abierto, setAbierto] = useState(false)
  const esMovil = useIsMobile()
  const limite = parsearFecha(minimo)
  return (
    <Controller
      control={control}
      name={nombre}
      render={({ field, fieldState }) => {
        const fecha = parsearFecha(
          typeof field.value === "string" ? field.value : ""
        )
        return (
          <Field
            data-invalid={fieldState.invalid || undefined}
            className={className}
          >
            <Etiqueta htmlFor={id} etiqueta={etiqueta} opcional={opcional} />
            <div className="flex gap-1.5">
              <Popover open={abierto} onOpenChange={setAbierto}>
                <PopoverTrigger
                  render={
                    <Button
                      id={id}
                      type="button"
                      variant="outline"
                      disabled={deshabilitado}
                      aria-invalid={fieldState.invalid || undefined}
                      className="min-w-0 flex-1 justify-start font-normal"
                    />
                  }
                >
                  <CalendarDays data-icon="inline-start" aria-hidden />
                  <span
                    className={cn(
                      "truncate cifras",
                      !fecha && "text-muted-foreground"
                    )}
                  >
                    {fecha ? formatearFecha(fecha, "medio") : placeholder}
                  </span>
                  <ChevronDown
                    data-icon="inline-end"
                    aria-hidden
                    className="ml-auto opacity-60"
                  />
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  // El popover es un `dialog`: sin nombre, el lector solo dice «diálogo».
                  aria-label={
                    typeof etiqueta === "string"
                      ? `Elegir la fecha: ${etiqueta}`
                      : "Elegir la fecha"
                  }
                  className="w-auto max-w-[calc(100vw-2rem)] p-0"
                >
                  <Calendar
                    mode="single"
                    locale={es}
                    timeZone={ZONA}
                    selected={fecha ?? undefined}
                    defaultMonth={fecha ?? limite ?? undefined}
                    disabled={limite ? { before: limite } : undefined}
                    onSelect={(dia) => {
                      if (!dia) return
                      field.onChange(serializarFecha(inicioDelDia(dia)))
                      field.onBlur()
                      setAbierto(false)
                    }}
                    // Mismo calendario que los selectores de periodo: «hoy»
                    // con anillo y celdas para el dedo en el teléfono.
                    classNames={{ today: CLASES_CALENDARIO.today }}
                    className={cn("p-3", claseCeldaCalendario(esMovil))}
                  />
                </PopoverContent>
              </Popover>
              {opcional && fecha ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Quitar la fecha"
                  disabled={deshabilitado}
                  onClick={() => field.onChange("")}
                >
                  <X aria-hidden />
                </Button>
              ) : null}
            </div>
            {descripcion ? (
              <FieldDescription>{descripcion}</FieldDescription>
            ) : null}
            <FieldError errors={[fieldState.error]} />
          </Field>
        )
      }}
    />
  )
}

/** Hora del día (HH:mm) en Bogotá. */
export function CampoHora({
  nombre,
  etiqueta,
  descripcion,
  deshabilitado,
  className,
}: PropsBase) {
  const { register } = useFormContext<FieldValues>()
  const { error, invalid } = useEstadoCampo(nombre)
  const id = `${useId()}-${nombre}`
  return (
    <Field data-invalid={invalid || undefined} className={className}>
      <FieldLabel htmlFor={id}>{etiqueta}</FieldLabel>
      <Input
        id={id}
        type="time"
        step={900}
        disabled={deshabilitado}
        aria-invalid={invalid || undefined}
        className="cifras"
        {...register(nombre)}
      />
      {descripcion ? <FieldDescription>{descripcion}</FieldDescription> : null}
      <FieldError errors={[error]} />
    </Field>
  )
}

/** Lista corta de textos (relaciones de aspecto, tipos de archivo) como fichas editables. */
export function CampoEtiquetas({
  nombre,
  etiqueta,
  descripcion,
  deshabilitado,
  className,
  placeholder,
  sugerencias = [],
}: PropsBase & { placeholder?: string; sugerencias?: readonly string[] }) {
  const { control } = useFormContext<FieldValues>()
  const id = `${useId()}-${nombre}`
  const [texto, setTexto] = useState("")
  return (
    <Controller
      control={control}
      name={nombre}
      render={({ field, fieldState }) => {
        const valores: string[] = Array.isArray(field.value) ? field.value : []
        const agregar = (valor: string) => {
          const limpio = valor.trim()
          if (!limpio || valores.includes(limpio)) return
          field.onChange([...valores, limpio])
        }
        const teclas = (evento: KeyboardEvent<HTMLInputElement>) => {
          if (evento.key === "Enter" || evento.key === ",") {
            evento.preventDefault()
            agregar(texto)
            setTexto("")
          } else if (evento.key === "Backspace" && !texto && valores.length) {
            field.onChange(valores.slice(0, -1))
          }
        }
        const pendientes = sugerencias.filter((s) => !valores.includes(s))
        return (
          <Field
            data-invalid={fieldState.invalid || undefined}
            className={className}
          >
            <FieldLabel htmlFor={id}>{etiqueta}</FieldLabel>
            <div
              className={cn(
                "flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
                fieldState.invalid && "border-destructive"
              )}
            >
              {valores.map((valor) => (
                <span
                  key={valor}
                  className="inline-flex h-6 items-center gap-1 rounded-md bg-muted pr-0.5 pl-2 font-mono text-xs"
                >
                  {valor}
                  <button
                    type="button"
                    disabled={deshabilitado}
                    onClick={() =>
                      field.onChange(valores.filter((v) => v !== valor))
                    }
                    aria-label={`Quitar ${valor}`}
                    className="grid size-5 place-items-center rounded text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:anillo-foco"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              ))}
              <input
                id={id}
                value={texto}
                onChange={(evento) => setTexto(evento.target.value)}
                onKeyDown={teclas}
                onBlur={() => {
                  agregar(texto)
                  setTexto("")
                  field.onBlur()
                }}
                placeholder={valores.length ? "" : placeholder}
                disabled={deshabilitado}
                autoComplete="off"
                aria-invalid={fieldState.invalid || undefined}
                className="h-6 min-w-24 flex-1 bg-transparent font-mono text-xs outline-none placeholder:font-sans placeholder:text-muted-foreground"
              />
            </div>
            {pendientes.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">
                  Sugerencias:
                </span>
                {pendientes.map((sugerencia) => (
                  <Button
                    key={sugerencia}
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={deshabilitado}
                    onClick={() => agregar(sugerencia)}
                    className="font-mono"
                  >
                    <Plus data-icon="inline-start" aria-hidden />
                    {sugerencia}
                  </Button>
                ))}
              </div>
            ) : null}
            {descripcion ? (
              <FieldDescription>{descripcion}</FieldDescription>
            ) : null}
            <FieldError errors={[fieldState.error]} />
          </Field>
        )
      }}
    />
  )
}
