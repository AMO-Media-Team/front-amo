"use client"

import { AtSign, Info, Plus, Trash2, Users } from "lucide-react"
import { useRef } from "react"
import {
  Controller,
  useFieldArray,
  useFormContext,
  useFormState,
  useWatch,
} from "react-hook-form"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { MarcaPlataforma } from "@/features/operacion/components/distintivos"
import { formatearNumero } from "@/lib/format"

import {
  interpretarSeguidores,
  MAXIMO_CUENTAS,
  PLATAFORMAS_CUENTA,
  type PlataformaCuenta,
  seguidoresMaximos,
  siguientePlataforma,
} from "../cuentas"
import { cuentaVacia, type EntradaSolicitudVinculacion } from "../schemas"
import { CampoTextoPublico } from "./campos-publicos"

const PISTAS_USUARIO: Readonly<Record<PlataformaCuenta, string>> = {
  INSTAGRAM: "@tumedio o instagram.com/tumedio",
  FACEBOOK: "TuMedio o facebook.com/TuMedio",
  TIKTOK: "@tumedio o tiktok.com/@tumedio",
}

function SelectorPlataforma({
  indice,
  deshabilitado,
}: {
  indice: number
  deshabilitado: boolean
}) {
  const { control } = useFormContext<EntradaSolicitudVinculacion>()
  return (
    <Controller
      control={control}
      name={`cuentas.${indice}.plataforma`}
      render={({ field, fieldState }) => (
        <div className="flex flex-col gap-1.5">
          <RadioGroup
            value={field.value}
            onValueChange={(valor) => field.onChange(valor)}
            disabled={deshabilitado}
            aria-label={`Red social de la cuenta ${indice + 1}`}
            className="grid grid-cols-3 gap-2"
          >
            {PLATAFORMAS_CUENTA.map((plataforma) => (
              <label
                key={plataforma}
                className="flex h-11 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border bg-background/60 px-1.5 text-sm transition-colors select-none hover:bg-muted/60 has-data-checked:border-primary has-data-checked:bg-primary/8 has-data-checked:font-medium has-data-disabled:cursor-not-allowed has-data-disabled:opacity-60 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 dark:bg-input/20"
              >
                <RadioGroupItem value={plataforma} className="sr-only" />
                <MarcaPlataforma
                  plataforma={plataforma}
                  conNombre
                  className="min-w-0 [&>span:last-child]:truncate"
                />
              </label>
            ))}
          </RadioGroup>
          <FieldError errors={[fieldState.error]} />
        </div>
      )}
    />
  )
}

function FilaCuenta({
  indice,
  total,
  deshabilitado,
  onQuitar,
}: {
  indice: number
  total: number
  deshabilitado: boolean
  onQuitar: () => void
}) {
  const { control } = useFormContext<EntradaSolicitudVinculacion>()
  const plataforma = useWatch({
    control,
    name: `cuentas.${indice}.plataforma`,
  })
  const numero = indice + 1
  return (
    <fieldset className="relative rounded-xl border bg-card/40 p-3 sm:p-4">
      <legend className="float-left mb-3 w-full pr-12 text-sm font-medium">
        Cuenta {numero}
        <span className="sr-only"> de {total}</span>
      </legend>
      {total > 1 ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onQuitar}
          disabled={deshabilitado}
          aria-label={`Quitar la cuenta ${numero}`}
          className="absolute top-2 right-2 text-muted-foreground hover:text-destructive"
        >
          <Trash2 aria-hidden />
        </Button>
      ) : null}
      <div className="clear-left flex flex-col gap-3">
        <SelectorPlataforma indice={indice} deshabilitado={deshabilitado} />
        <div className="grid grid-cols-[minmax(0,1fr)_8.5rem] items-start gap-3">
          <CampoTextoPublico
            nombre={`cuentas.${indice}.usuario`}
            etiqueta="Usuario o enlace"
            icono={AtSign}
            placeholder={PISTAS_USUARIO[plataforma ?? "INSTAGRAM"]}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={deshabilitado}
          />
          <CampoTextoPublico
            nombre={`cuentas.${indice}.seguidores`}
            etiqueta="Seguidores"
            icono={Users}
            placeholder="45.000"
            inputMode="numeric"
            autoComplete="off"
            disabled={deshabilitado}
          />
        </div>
      </div>
    </fieldset>
  )
}

/** Aviso (no bloquea) si ninguna cuenta declarada llega al umbral de AMO. */
function AvisoUmbral({ umbral }: { umbral: number }) {
  const { control } = useFormContext<EntradaSolicitudVinculacion>()
  const cuentas = useWatch({ control, name: "cuentas" }) ?? []
  const declarados = cuentas.map((cuenta) =>
    interpretarSeguidores(cuenta?.seguidores ?? "")
  )
  const todasConCifra = declarados.every(
    (resultado) => resultado.ok && resultado.valor !== null
  )
  const maximo = seguidoresMaximos(
    declarados.map((resultado) => ({
      seguidores: resultado.ok ? resultado.valor : null,
    }))
  )
  if (!todasConCifra || maximo === null || maximo >= umbral) return null
  return (
    <Alert role="status" className="border-info/30 bg-info/5">
      <Info aria-hidden className="text-info" />
      <AlertDescription>
        Ninguna de tus cuentas llega a {formatearNumero(umbral)} seguidores. Si
        tienes otra más grande, agrégala; si no, envía la solicitud igual y la
        revisamos.
      </AlertDescription>
    </Alert>
  )
}

/**
 * Las cuentas del medio (de 1 a 6): red social, usuario o enlace, y
 * seguidores aproximados. Al agregar se propone la red que falta y se lleva
 * el foco al usuario; al quitar, el foco vuelve a «Agregar otra cuenta».
 */
export function CamposCuentas({
  umbral,
  deshabilitado,
}: {
  umbral: number
  deshabilitado: boolean
}) {
  const { control, getValues } = useFormContext<EntradaSolicitudVinculacion>()
  const { fields, append, remove } = useFieldArray({ control, name: "cuentas" })
  const { errors } = useFormState({ control, name: "cuentas" })
  // Errores de la lista entera (cantidad de cuentas), no de una fila.
  const errorLista = errors.cuentas?.root?.message ?? errors.cuentas?.message
  const agregar = useRef<HTMLButtonElement>(null)
  const lleno = fields.length >= MAXIMO_CUENTAS

  function agregarCuenta() {
    const usadas = (getValues("cuentas") ?? []).map(
      (cuenta) => cuenta.plataforma
    )
    append(cuentaVacia(siguientePlataforma(usadas)), {
      focusName: `cuentas.${fields.length}.usuario`,
    })
  }

  function quitarCuenta(indice: number) {
    remove(indice)
    // El botón se desmonta con la fila: el foco no debe perderse.
    requestAnimationFrame(() => agregar.current?.focus())
  }

  return (
    <div className="flex flex-col gap-3">
      {fields.map((campo, indice) => (
        <FilaCuenta
          key={campo.id}
          indice={indice}
          total={fields.length}
          deshabilitado={deshabilitado}
          onQuitar={() => quitarCuenta(indice)}
        />
      ))}
      {errorLista ? <FieldError>{errorLista}</FieldError> : null}
      <AvisoUmbral umbral={umbral} />
      <Button
        ref={agregar}
        type="button"
        variant="outline"
        onClick={agregarCuenta}
        disabled={deshabilitado || lleno}
        className="h-11 w-full border-dashed"
      >
        <Plus data-icon="inline-start" aria-hidden />
        {lleno
          ? `Ya agregaste ${MAXIMO_CUENTAS} cuentas`
          : "Agregar otra cuenta"}
      </Button>
    </div>
  )
}
