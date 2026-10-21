"use client"

import { Check, ShieldCheck } from "lucide-react"
import { useId } from "react"
import {
  Controller,
  type FieldError as ErrorCampo,
  useFormContext,
  useWatch,
} from "react-hook-form"

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import { nombreColor, PALETA_ROLES } from "../paleta"
import { LONGITUD_MAXIMA_DESCRIPCION, mfaObligatoria } from "../schemas"
import type { TipoRol } from "../tipos"
import { IconoRol, InsigniaMfa, InsigniaTipo } from "./distintivos-rol"

/** Campos comunes al alta y a la edición (nombres de los esquemas zod). */
export type CamposComunesRol = {
  nombre: string
  descripcion: string
  color: string
  requiereMfa: boolean
}

/** Paleta de marca como grupo de radios nativos: flechas del teclado incluidas. */
export function SelectorColor({ deshabilitado }: { deshabilitado?: boolean }) {
  const { control } = useFormContext<CamposComunesRol>()
  const nombreGrupo = useId()

  return (
    <Controller
      control={control}
      name="color"
      render={({ field, fieldState }) => {
        const fueraDePaleta = !nombreColor(field.value)
        const opciones = fueraDePaleta
          ? [...PALETA_ROLES, { valor: field.value, nombre: "Color actual" }]
          : PALETA_ROLES
        return (
          <FieldSet data-invalid={fieldState.invalid || undefined}>
            <FieldLegend variant="label">Color</FieldLegend>
            <FieldDescription>
              Distingue el rol en listados, fichas y menús.
            </FieldDescription>
            <div className="flex flex-wrap gap-2">
              {opciones.map((color) => {
                const elegido =
                  field.value.toUpperCase() === color.valor.toUpperCase()
                return (
                  <label
                    key={color.valor}
                    title={color.nombre}
                    className="relative grid size-8 cursor-pointer place-items-center has-disabled:cursor-not-allowed has-disabled:opacity-50"
                  >
                    <input
                      type="radio"
                      name={nombreGrupo}
                      value={color.valor}
                      checked={elegido}
                      disabled={deshabilitado}
                      onChange={() => field.onChange(color.valor)}
                      onBlur={field.onBlur}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden
                      style={{ backgroundColor: color.valor }}
                      className="grid size-7 place-items-center rounded-full shadow-sm ring-1 ring-foreground/10 transition-transform duration-200 ease-suave ring-inset peer-checked:scale-90 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-ring hover:scale-105"
                    >
                      {elegido ? (
                        <Check className="size-4 text-white drop-shadow-[0_1px_1px_rgb(0_0_0/0.45)]" />
                      ) : null}
                    </span>
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-transparent transition-colors peer-checked:ring-(--anillo)"
                      style={{ ["--anillo" as string]: color.valor }}
                    />
                    <span className="sr-only">{color.nombre}</span>
                  </label>
                )
              })}
            </div>
            <FieldError errors={[fieldState.error]} />
          </FieldSet>
        )
      }}
    />
  )
}

export function CampoDescripcion({
  deshabilitado,
  error,
}: {
  deshabilitado?: boolean
  error?: ErrorCampo
}) {
  const { register, control } = useFormContext<CamposComunesRol>()
  const valor = useWatch({ control, name: "descripcion" }) ?? ""
  const restante = LONGITUD_MAXIMA_DESCRIPCION - valor.length

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor="rol-descripcion">
        Descripción{" "}
        <span className="font-normal text-muted-foreground">(opcional)</span>
      </FieldLabel>
      <Textarea
        id="rol-descripcion"
        rows={3}
        maxLength={LONGITUD_MAXIMA_DESCRIPCION}
        placeholder="Para qué sirve el rol y a quién se asigna."
        disabled={deshabilitado}
        aria-invalid={error ? true : undefined}
        aria-describedby="rol-descripcion-restante"
        className="resize-none"
        {...register("descripcion")}
      />
      <p
        id="rol-descripcion-restante"
        className={cn(
          "text-right text-xs cifras text-muted-foreground",
          restante < 30 && "text-warning"
        )}
      >
        {restante} caracteres disponibles
      </p>
      <FieldError errors={[error]} />
    </Field>
  )
}

/** MFA: forzada (y bloqueada) para roles del equipo interno. */
export function CampoMfa({
  tipo,
  deshabilitado,
  onCambio,
}: {
  tipo: TipoRol
  deshabilitado?: boolean
  /** La persona movió el interruptor (deja de seguir al tipo de rol). */
  onCambio?: () => void
}) {
  const { control } = useFormContext<CamposComunesRol>()
  const obligatoria = mfaObligatoria(tipo)

  return (
    <Controller
      control={control}
      name="requiereMfa"
      render={({ field }) => (
        <FieldLabel htmlFor="rol-mfa">
          <Field orientation="horizontal">
            <ShieldCheck
              className="mt-0.5 size-4 shrink-0 text-success"
              aria-hidden
            />
            <FieldContent>
              <span className="text-sm font-medium">
                Exigir verificación en dos pasos
              </span>
              <FieldDescription>
                {obligatoria
                  ? "Obligatoria en los roles del equipo interno: protege el acceso administrativo."
                  : "Pide un código de su app autenticadora al ingresar."}
              </FieldDescription>
            </FieldContent>
            <Switch
              id="rol-mfa"
              checked={obligatoria || field.value}
              onCheckedChange={(valor) => {
                field.onChange(valor)
                onCambio?.()
              }}
              disabled={obligatoria || deshabilitado}
            />
          </Field>
        </FieldLabel>
      )}
    />
  )
}

/** Cómo se verá el rol en la plataforma, con los valores del formulario. */
export function VistaPreviaRol({
  clave,
  tipo,
}: {
  clave: string
  tipo: TipoRol
}) {
  const { control } = useFormContext<CamposComunesRol>()
  const [nombre, color, requiereMfa] = useWatch({
    control,
    name: ["nombre", "color", "requiereMfa"],
  })
  const mfa = mfaObligatoria(tipo) || requiereMfa

  return (
    <div
      aria-label="Vista previa del rol"
      role="group"
      className="relative flex shrink-0 items-center gap-3 overflow-hidden rounded-xl border bg-card p-3"
    >
      <span
        aria-hidden
        style={{ backgroundColor: color }}
        className="absolute inset-y-0 left-0 w-1"
      />
      <IconoRol
        rol={{ clave, tipo, color }}
        tamano="md"
        className="self-start"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-col">
          <p className="truncate text-sm font-semibold">
            {nombre?.trim() || "Nuevo rol"}
          </p>
          <code className="truncate font-mono text-[0.6875rem] tracking-wide text-muted-foreground">
            {clave || "CLAVE_DEL_ROL"}
          </code>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <InsigniaTipo tipo={tipo} className="h-5 px-2" />
          {mfa ? <InsigniaMfa className="h-5 px-2" /> : null}
        </div>
      </div>
    </div>
  )
}
