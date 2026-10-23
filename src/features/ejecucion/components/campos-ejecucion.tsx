"use client"

import { Link2, TriangleAlert } from "lucide-react"
import { type ReactNode, useId } from "react"
import {
  Controller,
  type FieldValues,
  useFormContext,
  useFormState,
  useWatch,
} from "react-hook-form"

import { Checkbox } from "@/components/ui/checkbox"
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
  ejemploUrlPost,
  type PlataformaPost,
  validarUrlPost,
} from "@/lib/redes/url-post"
import { cn } from "@/lib/utils"

function useEstadoCampo(nombre: string) {
  const { control, getFieldState } = useFormContext<FieldValues>()
  const formState = useFormState({ control, name: nombre })
  return getFieldState(nombre, formState)
}

/** `aria-describedby` con solo lo que se pinta (ayuda, aviso, error). */
function describidoPor(...ids: (string | null | false | undefined)[]) {
  const lista = ids.filter(Boolean).join(" ")
  return lista || undefined
}

/**
 * Enlace del post: se valida con la plataforma, el formato y la cuenta de la
 * oferta (`validarUrlPost`), con un ejemplo del formato como ayuda y un aviso
 * que no bloquea si parece de otro tipo de contenido.
 */
export function CampoEnlacePost({
  nombre,
  plataforma,
  formato,
  cuenta,
  deshabilitado,
}: {
  nombre: string
  plataforma: PlataformaPost
  formato: string | null
  /** Usuario de la cuenta de la campaña (sin `@`). */
  cuenta: string | null
  deshabilitado?: boolean
}) {
  const { register, control } = useFormContext<FieldValues>()
  const { error, invalid } = useEstadoCampo(nombre)
  const valor = useWatch({ control, name: nombre }) as string | undefined
  const id = `${useId()}-${nombre}`
  const idAyuda = `${id}-ayuda`
  const idAviso = `${id}-aviso`
  const idError = `${id}-error`
  const resultado = valor?.trim()
    ? validarUrlPost(plataforma, valor, formato, cuenta)
    : null
  const aviso = !invalid && resultado?.ok ? resultado.aviso : undefined
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>Enlace de la publicación</FieldLabel>
      <InputGroup>
        <InputGroupAddon>
          <Link2 aria-hidden />
        </InputGroupAddon>
        <InputGroupInput
          id={id}
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          placeholder={ejemploUrlPost(plataforma, formato)}
          disabled={deshabilitado}
          aria-invalid={invalid || undefined}
          aria-describedby={describidoPor(
            idAyuda,
            aviso && idAviso,
            error?.message && idError
          )}
          className="text-[0.9375rem] md:text-sm"
          {...register(nombre)}
        />
      </InputGroup>
      <FieldDescription id={idAyuda}>
        En la app, abre la publicación, toca «Compartir» y luego «Copiar
        enlace». Debe verse así:{" "}
        <span className="break-all text-foreground/80">
          {ejemploUrlPost(plataforma, formato)}
        </span>
      </FieldDescription>
      <p
        id={idAviso}
        aria-live="polite"
        className={cn(
          "flex items-start gap-1.5 text-sm text-warning",
          !aviso && "sr-only"
        )}
      >
        {aviso ? (
          <>
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {aviso}
          </>
        ) : null}
      </p>
      <FieldError id={idError} errors={[error]} />
    </Field>
  )
}

/**
 * Cifra del panel escrita en es-CO («1.250», «12,5»). Como `CampoCifra`, pero
 * con `describidaPor`: los campos que suman a las interacciones apuntan
 * también al error de la suma, que se muestra fuera de ellos.
 */
export function CampoCifraMetrica({
  nombre,
  etiqueta,
  descripcion,
  opcional,
  decimal,
  sufijo,
  placeholder,
  deshabilitado,
  describidaPor,
}: {
  nombre: string
  etiqueta: string
  descripcion: string
  opcional?: boolean
  decimal?: boolean
  sufijo?: string
  placeholder?: string
  deshabilitado?: boolean
  /** Id de un error ajeno al campo que también lo describe. */
  describidaPor?: string
}) {
  const { register } = useFormContext<FieldValues>()
  const { error, invalid } = useEstadoCampo(nombre)
  const id = `${useId()}-${nombre}`
  const idAyuda = `${id}-ayuda`
  const idError = `${id}-error`
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>
        {etiqueta}
        {opcional ? (
          <span className="font-normal text-muted-foreground">(opcional)</span>
        ) : null}
      </FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          inputMode={decimal ? "decimal" : "numeric"}
          autoComplete="off"
          enterKeyHint="next"
          placeholder={placeholder}
          disabled={deshabilitado}
          aria-invalid={invalid || undefined}
          aria-describedby={describidoPor(
            idAyuda,
            error?.message && idError,
            describidaPor
          )}
          className="cifras"
          {...register(nombre)}
        />
        {sufijo ? (
          <InputGroupAddon align="inline-end">
            <InputGroupText>{sufijo}</InputGroupText>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      <FieldDescription id={idAyuda}>{descripcion}</FieldDescription>
      <FieldError id={idError} errors={[error]} />
    </Field>
  )
}

/** Hora exacta (HH:mm, de minuto en minuto) en Bogotá. */
export function CampoHoraExacta({
  nombre,
  etiqueta,
  descripcion,
  deshabilitado,
  className,
}: {
  nombre: string
  etiqueta: ReactNode
  descripcion?: ReactNode
  deshabilitado?: boolean
  className?: string
}) {
  const { register } = useFormContext<FieldValues>()
  const { error, invalid } = useEstadoCampo(nombre)
  const id = `${useId()}-${nombre}`
  const idAyuda = `${id}-ayuda`
  const idError = `${id}-error`
  return (
    <Field data-invalid={invalid || undefined} className={className}>
      <FieldLabel htmlFor={id}>{etiqueta}</FieldLabel>
      <Input
        id={id}
        type="time"
        step={60}
        disabled={deshabilitado}
        aria-invalid={invalid || undefined}
        aria-describedby={describidoPor(
          descripcion ? idAyuda : null,
          error?.message && idError
        )}
        className="cifras"
        {...register(nombre)}
      />
      {descripcion ? (
        <FieldDescription id={idAyuda}>{descripcion}</FieldDescription>
      ) : null}
      <FieldError id={idError} errors={[error]} />
    </Field>
  )
}

/** Declaración obligatoria de la etiqueta de publicidad (MED-013). */
export function CampoEtiquetaPublicidad({
  nombre,
  deshabilitado,
}: {
  nombre: string
  deshabilitado?: boolean
}) {
  const { control } = useFormContext<FieldValues>()
  const id = `${useId()}-${nombre}`
  const idAyuda = `${id}-ayuda`
  const idError = `${id}-error`
  return (
    <Controller
      control={control}
      name={nombre}
      render={({ field, fieldState }) => (
        <Field
          orientation="horizontal"
          data-invalid={fieldState.invalid || undefined}
          className="rounded-xl border bg-card/40 p-3.5 sm:p-4"
        >
          <Checkbox
            id={id}
            ref={field.ref}
            checked={field.value === true}
            onCheckedChange={(valor) => {
              field.onChange(valor === true)
              field.onBlur()
            }}
            disabled={deshabilitado}
            aria-invalid={fieldState.invalid || undefined}
            aria-describedby={describidoPor(
              idAyuda,
              fieldState.error?.message && idError
            )}
            className="mt-0.5"
          />
          <FieldContent className="gap-1.5">
            <FieldLabel htmlFor={id} className="leading-snug">
              Mi publicación lleva la etiqueta de publicidad
            </FieldLabel>
            <FieldDescription id={idAyuda}>
              Es obligatoria en toda pauta: «Colaboración pagada» o «Contenido
              de marca» de la red, o #Publicidad en el texto. Publica el copy
              del anunciante sin editarlo.
            </FieldDescription>
            <FieldError id={idError} errors={[fieldState.error]} />
          </FieldContent>
        </Field>
      )}
    />
  )
}
