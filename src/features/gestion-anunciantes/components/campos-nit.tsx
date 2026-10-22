"use client"

import { CircleCheck, Info } from "lucide-react"
import { type ClipboardEvent, useId } from "react"
import { useFormContext, useFormState, useWatch } from "react-hook-form"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  digitoSugerido,
  formatearNit,
  NIT_DIGITOS_MAX,
  normalizarNit,
  separarNit,
} from "@/lib/colombia/nit"

import type { EntradaAnunciante } from "../schemas"

/** Caracteres que admite el campo: el NIT con puntos y, si se pega, su guion y DV. */
const LARGO_MAXIMO_NIT = NIT_DIGITOS_MAX + 8

function PistaDigito({
  id,
  sugerido,
  digito,
  onUsar,
  deshabilitado,
}: {
  id: string
  sugerido: string | null
  digito: string
  onUsar: (digito: string) => void
  deshabilitado?: boolean
}) {
  if (!sugerido) {
    return (
      <FieldDescription id={id}>
        Escríbelo sin el dígito de verificación. Si lo pegas con puntos y guion,
        lo separamos.
      </FieldDescription>
    )
  }
  if (digito === sugerido) {
    return (
      <p id={id} className="flex items-center gap-1.5 text-sm text-success">
        <CircleCheck aria-hidden className="size-4 shrink-0" />
        El dígito de verificación coincide con el NIT.
      </p>
    )
  }
  return (
    <p
      id={id}
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground"
    >
      <Info aria-hidden className="size-4 shrink-0" />
      <span>
        Según el NIT, el dígito de verificación es{" "}
        <strong className="font-semibold cifras text-foreground">
          {sugerido}
        </strong>
        .
      </span>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto p-0"
        disabled={deshabilitado}
        onClick={() => onUsar(sugerido)}
      >
        Usar {sugerido}
      </Button>
    </p>
  )
}

/**
 * NIT y dígito de verificación (DIAN). El DV se sugiere en vivo a partir del
 * NIT, pero lo escribe la persona (lo copia del RUT): si no coincide, hay un
 * error de digitación en alguno de los dos y el esquema lo señala antes de
 * enviar. Pegar "900.123.456-8" reparte NIT y DV; al salir del campo el NIT
 * se muestra con puntos, como en el RUT.
 */
export function CamposNit({ deshabilitado }: { deshabilitado?: boolean }) {
  const { control, register, setValue, getFieldState, trigger } =
    useFormContext<EntradaAnunciante>()
  const estado = useFormState({
    control,
    name: ["nit", "digitoVerificacion"],
  })
  const enviado = estado.isSubmitted
  const [nit, digito] = useWatch({
    control,
    name: ["nit", "digitoVerificacion"],
  })
  const base = useId()
  const idNit = `${base}-nit`
  const idDigito = `${base}-dv`
  const idPista = `${base}-pista`
  const idErrorNit = `${base}-error-nit`
  const idErrorDigito = `${base}-error-dv`
  const sugerido = digitoSugerido(nit)
  const errorNit = getFieldState("nit", estado).error
  const errorDigito = getFieldState("digitoVerificacion", estado).error
  // La pista (con el DV sugerido) y el error se leen al llegar a cada campo.
  const descripcion = (idError: string, error: unknown) =>
    error ? `${idPista} ${idError}` : idPista

  /**
   * Solo se revalida lo que ya se tocó, ya muestra un error o pasó por un
   * envío: no se regaña antes de tiempo, pero tampoco queda un error viejo
   * junto a la pista que dice que el DV coincide.
   */
  function debeValidar(campo: "nit" | "digitoVerificacion"): boolean {
    const { isTouched, invalid } = getFieldState(campo)
    return enviado || isTouched || invalid
  }

  function fijar(campo: "nit" | "digitoVerificacion", valor: string) {
    setValue(campo, valor, {
      shouldDirty: true,
      shouldValidate: debeValidar(campo),
    })
  }

  /** Pegado con DV ("900.123.456-8"): cada parte a su campo. */
  function alPegar(evento: ClipboardEvent<HTMLInputElement>) {
    const separado = separarNit(evento.clipboardData.getData("text"))
    if (!separado.dv) return
    evento.preventDefault()
    fijar("nit", formatearNit(separado.nit))
    fijar("digitoVerificacion", separado.dv)
  }

  const registroNit = register("nit", {
    // El error del DV depende del NIT: al corregir uno se revisa el otro.
    onChange: () => {
      if (debeValidar("digitoVerificacion")) void trigger("digitoVerificacion")
    },
    onBlur: (evento: { target: { value: string } }) => {
      const limpio = normalizarNit(evento.target.value)
      if (/^\d+$/.test(limpio)) {
        setValue("nit", formatearNit(limpio), { shouldDirty: true })
      }
    },
  })
  const registroDigito = register("digitoVerificacion")

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[minmax(0,1fr)_4.5rem] items-start gap-3">
        <Field data-invalid={errorNit ? true : undefined}>
          <FieldLabel htmlFor={idNit}>NIT</FieldLabel>
          <Input
            id={idNit}
            inputMode="numeric"
            autoComplete="off"
            placeholder="900.123.456"
            maxLength={LARGO_MAXIMO_NIT}
            disabled={deshabilitado}
            aria-invalid={errorNit ? true : undefined}
            aria-describedby={descripcion(idErrorNit, errorNit)}
            className="cifras"
            onPaste={alPegar}
            {...registroNit}
          />
        </Field>
        <Field data-invalid={errorDigito ? true : undefined}>
          <FieldLabel htmlFor={idDigito}>
            DV <span className="sr-only">(dígito de verificación)</span>
          </FieldLabel>
          <Input
            id={idDigito}
            inputMode="numeric"
            autoComplete="off"
            maxLength={1}
            placeholder={sugerido ?? "–"}
            disabled={deshabilitado}
            aria-invalid={errorDigito ? true : undefined}
            aria-describedby={descripcion(idErrorDigito, errorDigito)}
            className="text-center cifras placeholder:opacity-60"
            {...registroDigito}
          />
        </Field>
      </div>
      <PistaDigito
        id={idPista}
        sugerido={sugerido}
        digito={digito.trim()}
        deshabilitado={deshabilitado}
        onUsar={(valor) => fijar("digitoVerificacion", valor)}
      />
      <FieldError id={idErrorNit} errors={[errorNit]} />
      <FieldError id={idErrorDigito} errors={[errorDigito]} />
    </div>
  )
}
