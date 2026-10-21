"use client"

import { REGEXP_ONLY_DIGITS } from "input-otp"
import { useId } from "react"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp"

export const LONGITUD_CODIGO = 6
const CLASE_CASILLA = "size-12 text-xl font-semibold cifras sm:size-13"

interface CampoCodigoProps {
  name: string
  valor: string
  onCambio: (valor: string) => void
  /** Se llama al completar los 6 dígitos (autoenvío). */
  onCompleto?: (valor: string) => void
  etiqueta?: string
  ayuda?: string
  error?: string
  deshabilitado?: boolean
  autoFocus?: boolean
}

/** Código TOTP de 6 dígitos en dos grupos de 3 (como lo muestran las apps). */
export function CampoCodigo({
  name,
  valor,
  onCambio,
  onCompleto,
  etiqueta = "Código de verificación",
  ayuda,
  error,
  deshabilitado = false,
  autoFocus = false,
}: CampoCodigoProps) {
  const id = useId()
  const idAyuda = `${id}-ayuda`
  const idError = `${id}-error`
  const descritoPor = [ayuda && idAyuda, error && idError]
    .filter(Boolean)
    .join(" ")

  return (
    <Field data-invalid={Boolean(error)} className="items-center gap-3">
      <FieldLabel htmlFor={id} className="sr-only">
        {etiqueta}
      </FieldLabel>
      <InputOTP
        id={id}
        name={name}
        maxLength={LONGITUD_CODIGO}
        pattern={REGEXP_ONLY_DIGITS}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        value={valor}
        onChange={onCambio}
        onComplete={onCompleto}
        disabled={deshabilitado}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={descritoPor || undefined}
        containerClassName="justify-center"
      >
        <InputOTPGroup>
          {[0, 1, 2].map((indice) => (
            <InputOTPSlot
              key={indice}
              index={indice}
              aria-invalid={Boolean(error) || undefined}
              className={CLASE_CASILLA}
            />
          ))}
        </InputOTPGroup>
        <InputOTPSeparator className="text-muted-foreground" />
        <InputOTPGroup>
          {[3, 4, 5].map((indice) => (
            <InputOTPSlot
              key={indice}
              index={indice}
              aria-invalid={Boolean(error) || undefined}
              className={CLASE_CASILLA}
            />
          ))}
        </InputOTPGroup>
      </InputOTP>
      {ayuda ? (
        <FieldDescription id={idAyuda} className="text-center">
          {ayuda}
        </FieldDescription>
      ) : null}
      {error ? (
        <FieldError id={idError} className="text-center">
          {error}
        </FieldError>
      ) : null}
    </Field>
  )
}
