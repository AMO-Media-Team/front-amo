"use client"

import { useId } from "react"
import { Controller, useFormContext } from "react-hook-form"

import { SelectorTerritorio } from "@/components/territorio/selector-territorio"
import { Field, FieldDescription, FieldError } from "@/components/ui/field"

import type { EntradaRegistrarMedio } from "../schemas"

/**
 * Municipio del medio: departamento → municipio, solo los activos (MED-002).
 * Si la BD lo rechaza igual (`AMO_CONFIG_INVALIDA`, se inhabilitó con la hoja
 * abierta), el error vuelve a este campo.
 */
export function CampoMunicipio({ deshabilitado }: { deshabilitado?: boolean }) {
  const { control } = useFormContext<EntradaRegistrarMedio>()
  const id = useId()
  const idAyuda = `${id}-ayuda`
  const idError = `${id}-error`

  return (
    <Controller
      control={control}
      name="municipioCodigo"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid || undefined}>
          <SelectorTerritorio
            modo="municipio"
            id={id}
            valor={field.value}
            invalido={fieldState.invalid}
            deshabilitado={deshabilitado}
            describedBy={fieldState.invalid ? `${idAyuda} ${idError}` : idAyuda}
            onCambio={(municipio) => {
              field.onChange(municipio?.codigo ?? "")
              field.onBlur()
            }}
          />
          <FieldDescription id={idAyuda}>
            Donde está su audiencia principal.
          </FieldDescription>
          <FieldError id={idError} errors={[fieldState.error]} />
        </Field>
      )}
    />
  )
}
