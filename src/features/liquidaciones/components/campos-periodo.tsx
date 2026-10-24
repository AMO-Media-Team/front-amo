"use client"

import { useId } from "react"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

import type { ErroresPeriodo, PeriodoCorte } from "../periodo"

/**
 * Primer y último día del periodo de una liquidación. El último día va hasta
 * hoy (un periodo abierto bloquearía por traslape el resto). Cada error queda
 * asociado a su campo.
 */
export function CamposPeriodo({
  valor,
  onCambiar,
  errores,
  hoy,
  deshabilitado = false,
}: {
  valor: PeriodoCorte
  onCambiar: (valor: PeriodoCorte) => void
  errores: ErroresPeriodo
  /** `AAAA-MM-DD` de Bogotá (lo calcula el servidor). */
  hoy: string
  deshabilitado?: boolean
}) {
  const id = useId()
  const ids = {
    inicio: `${id}-inicio`,
    fin: `${id}-fin`,
    ayudaFin: `${id}-fin-ayuda`,
    errorInicio: `${id}-inicio-error`,
    errorFin: `${id}-fin-error`,
  }
  return (
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="sr-only">Periodo de la liquidación</legend>
      <Field data-invalid={errores.inicio ? true : undefined}>
        <FieldLabel htmlFor={ids.inicio}>Primer día</FieldLabel>
        <Input
          id={ids.inicio}
          type="date"
          value={valor.inicio}
          max={valor.fin || hoy}
          required
          disabled={deshabilitado}
          aria-invalid={errores.inicio ? true : undefined}
          aria-describedby={errores.inicio ? ids.errorInicio : undefined}
          onChange={(evento) =>
            onCambiar({ ...valor, inicio: evento.target.value })
          }
          className="h-10 sm:h-9"
        />
        <FieldError id={ids.errorInicio}>{errores.inicio}</FieldError>
      </Field>
      <Field data-invalid={errores.fin ? true : undefined}>
        <FieldLabel htmlFor={ids.fin}>Último día</FieldLabel>
        <Input
          id={ids.fin}
          type="date"
          value={valor.fin}
          min={valor.inicio || undefined}
          max={hoy}
          required
          disabled={deshabilitado}
          aria-invalid={errores.fin ? true : undefined}
          aria-describedby={
            errores.fin ? `${ids.errorFin} ${ids.ayudaFin}` : ids.ayudaFin
          }
          onChange={(evento) =>
            onCambiar({ ...valor, fin: evento.target.value })
          }
          className="h-10 sm:h-9"
        />
        <FieldDescription id={ids.ayudaFin}>
          Hasta hoy como máximo: entran las verificadas hasta ese día.
        </FieldDescription>
        <FieldError id={ids.errorFin}>{errores.fin}</FieldError>
      </Field>
    </fieldset>
  )
}
