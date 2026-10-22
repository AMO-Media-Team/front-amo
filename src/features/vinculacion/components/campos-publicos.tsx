"use client"

import type { LucideIcon } from "lucide-react"
import { type ComponentProps, type ReactNode, useId } from "react"
import {
  Controller,
  type FieldPath,
  useFormContext,
  useFormState,
  useWatch,
} from "react-hook-form"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { normalizarParrafos } from "@/features/gestion-medios/schemas"
import { TIPOS_MEDIO } from "@/features/operacion/estados"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Constants } from "@/types/database.types"

import {
  type EntradaSolicitudVinculacion,
  LIMITES_SOLICITUD,
} from "../schemas"

/**
 * Campos del formulario público `/vincular`, con la misma presencia que los
 * de ingreso (44 px de alto, icono, etiqueta visible): quien lo llena suele
 * estar en el celular. Cada uno enlaza su ayuda y su error con
 * `aria-describedby` y marca `aria-invalid`.
 */

type Campo = FieldPath<EntradaSolicitudVinculacion>

/** Error y estado de un campo del formulario de la solicitud. */
export function useCampo(nombre: Campo) {
  const { control, getFieldState } = useFormContext<EntradaSolicitudVinculacion>()
  const formState = useFormState({ control, name: nombre })
  return getFieldState(nombre, formState)
}

/** Ids de ayuda y error, y el `aria-describedby` que los une. */
export function useDescripcion(conAyuda: boolean, conError: boolean) {
  const base = useId()
  const idAyuda = `${base}-ayuda`
  const idError = `${base}-error`
  const describedBy =
    [conAyuda ? idAyuda : null, conError ? idError : null]
      .filter(Boolean)
      .join(" ") || undefined
  return { id: `${base}-campo`, idAyuda, idError, describedBy }
}

export function EtiquetaCampo({
  htmlFor,
  children,
  opcional = false,
}: {
  htmlFor: string
  children: ReactNode
  opcional?: boolean
}) {
  return (
    <FieldLabel htmlFor={htmlFor}>
      {children}
      {opcional ? (
        <span className="font-normal text-muted-foreground">(opcional)</span>
      ) : null}
    </FieldLabel>
  )
}

type PropsInput = Omit<
  ComponentProps<"input">,
  "id" | "name" | "className" | "aria-invalid" | "aria-describedby"
>

export function CampoTextoPublico({
  nombre,
  etiqueta,
  icono: Icono,
  ayuda,
  opcional = false,
  className,
  ...input
}: PropsInput & {
  nombre: Campo
  etiqueta: string
  icono: LucideIcon
  ayuda?: ReactNode
  opcional?: boolean
  className?: string
}) {
  const { register } = useFormContext<EntradaSolicitudVinculacion>()
  const { error, invalid } = useCampo(nombre)
  const { id, idAyuda, idError, describedBy } = useDescripcion(
    Boolean(ayuda),
    invalid
  )
  return (
    <Field data-invalid={invalid || undefined} className={cn("gap-2", className)}>
      <EtiquetaCampo htmlFor={id} opcional={opcional}>
        {etiqueta}
      </EtiquetaCampo>
      <InputGroup className="h-11 bg-background/60 dark:bg-input/20">
        <InputGroupAddon align="inline-start" className="pl-3">
          <Icono aria-hidden className="size-4 text-muted-foreground" />
        </InputGroupAddon>
        <InputGroupInput
          id={id}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className="h-full text-[0.9375rem] md:text-[0.9375rem]"
          {...input}
          {...register(nombre)}
        />
      </InputGroup>
      {ayuda ? <FieldDescription id={idAyuda}>{ayuda}</FieldDescription> : null}
      <FieldError id={idError} errors={[error]} />
    </Field>
  )
}

const OPCIONES_TIPO = Constants.public.Enums.medio_tipo.map((tipo) => ({
  value: tipo,
  label: TIPOS_MEDIO[tipo],
}))

/** Tipo de medio (opcional: el equipo AMO lo confirma al registrarlo). */
export function CampoTipoMedio({ deshabilitado }: { deshabilitado: boolean }) {
  const { control } = useFormContext<EntradaSolicitudVinculacion>()
  const { id, idAyuda, idError } = useDescripcion(true, true)
  return (
    <Controller
      control={control}
      name="tipo"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid || undefined} className="gap-2">
          <EtiquetaCampo htmlFor={id} opcional>
            Tipo de medio
          </EtiquetaCampo>
          <Select
            value={field.value || null}
            onValueChange={(valor) => field.onChange(valor ?? "")}
            items={OPCIONES_TIPO}
            disabled={deshabilitado}
          >
            <SelectTrigger
              id={id}
              ref={field.ref}
              onBlur={field.onBlur}
              aria-invalid={fieldState.invalid || undefined}
              aria-describedby={
                fieldState.invalid ? `${idAyuda} ${idError}` : idAyuda
              }
              className="w-full bg-background/60 text-[0.9375rem] data-[size=default]:h-11 dark:bg-input/20"
            >
              <SelectValue placeholder="Elige el que más se parezca" />
            </SelectTrigger>
            <SelectContent>
              {OPCIONES_TIPO.map((opcion) => (
                <SelectItem key={opcion.value} value={opcion.value}>
                  {opcion.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription id={idAyuda}>
            Si no sabes cuál elegir, déjalo en blanco.
          </FieldDescription>
          <FieldError id={idError} errors={[fieldState.error]} />
        </Field>
      )}
    />
  )
}

/** Mensaje libre con su contador (se avisa cerca del límite). */
export function CampoMensaje({ deshabilitado }: { deshabilitado: boolean }) {
  const { control, register } = useFormContext<EntradaSolicitudVinculacion>()
  const { error, invalid } = useCampo("mensaje")
  const texto = useWatch({ control, name: "mensaje" }) ?? ""
  const usados = normalizarParrafos(texto).length
  const maximo = LIMITES_SOLICITUD.mensajeMax
  const { id, idAyuda, idError, describedBy } = useDescripcion(true, invalid)
  return (
    <Field data-invalid={invalid || undefined} className="gap-2">
      <EtiquetaCampo htmlFor={id} opcional>
        ¿Algo más que debamos saber?
      </EtiquetaCampo>
      <Textarea
        id={id}
        rows={3}
        disabled={deshabilitado}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        placeholder="Desde cuándo publicas, a quién llegas, qué temas cubres…"
        className="min-h-24 resize-y bg-background/60 text-[0.9375rem] md:text-[0.9375rem] dark:bg-input/20"
        {...register("mensaje")}
      />
      <FieldDescription
        id={idAyuda}
        className="flex items-start justify-between gap-3"
      >
        <span>Nos ayuda a conocer tu medio antes de contactarte.</span>
        <span
          className={cn(
            "shrink-0 cifras",
            usados > maximo * 0.9 && "font-medium text-warning",
            usados > maximo && "text-destructive"
          )}
        >
          {formatearNumero(usados)}
          <span aria-hidden>/</span>
          <span className="sr-only"> de </span>
          {formatearNumero(maximo)}
          <span className="sr-only"> caracteres</span>
        </span>
      </FieldDescription>
      <FieldError id={idError} errors={[error]} />
    </Field>
  )
}
