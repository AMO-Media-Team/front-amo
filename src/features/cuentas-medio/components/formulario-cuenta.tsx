"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { AtSign, CircleCheck, Link2, Lock } from "lucide-react"
import { useId, useMemo, useTransition } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"

import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { numeroAEntrada } from "@/features/configuracion/numeros"
import {
  ORDEN_PLATAFORMAS,
  PLATAFORMAS,
  type Plataforma,
} from "@/features/operacion/estados"
import { MarcaPlataforma } from "@/features/operacion/components/distintivos"
import { formatearHandle } from "@/features/operacion/formato"
import { aplicarErroresServidor } from "@/features/usuarios/components/errores-formulario"
import { fallo } from "@/lib/result"

import { editarCuenta, registrarCuenta } from "../actions"
import { MENSAJES_CUENTAS } from "../errores"
import {
  EJEMPLOS_PERFIL,
  interpretarPerfil,
  LARGO_MAXIMO_ENTRADA,
  urlLegible,
} from "../perfil-red"
import {
  CAMPOS_CUENTA,
  type EntradaCuenta,
  esquemaFormularioCuenta,
  VALORES_CUENTA,
} from "../schemas"
import type { CuentaGuardada, CuentaMedio } from "../tipos"

/** Cuenta que ya tiene el medio (para avisar de un duplicado sin ir al servidor). */
export type CuentaExistente = Pick<CuentaMedio, "id" | "plataforma" | "handle">

export interface EdicionCuenta {
  cuenta: Pick<
    CuentaMedio,
    "id" | "plataforma" | "handle" | "tarifaReferencia" | "actualizadaAt"
  >
  /** El usuario no cambia en una cuenta verificada o en revisión. */
  perfilBloqueado: string | null
}

export interface FormularioCuentaProps {
  /** Id del `<form>` (el botón de enviar vive en el pie de la hoja). */
  id: string
  edicion?: EdicionCuenta
  existentes: readonly CuentaExistente[]
  onPendiente: (pendiente: boolean) => void
  onGuardada: (cuenta: CuentaGuardada, handle: string) => void
}

function valoresIniciales(edicion?: EdicionCuenta): EntradaCuenta {
  if (!edicion) return VALORES_CUENTA
  const { cuenta } = edicion
  return {
    plataforma: cuenta.plataforma,
    perfil: formatearHandle(cuenta.handle),
    tarifa: numeroAEntrada(cuenta.tarifaReferencia),
  }
}

/**
 * Usuario que se guardará si el perfil cambió (o si es un alta); `null` si
 * al editar se dejó como estaba o si no es válido (el esquema ya lo marcó).
 */
export function perfilNuevo(
  plataforma: Plataforma,
  perfil: string,
  perfilInicial: string | null
): string | null {
  if (perfilInicial !== null && perfil.trim() === perfilInicial) return null
  const resultado = interpretarPerfil(plataforma, perfil)
  return resultado.ok ? resultado.handle : null
}

/** ¿Otra cuenta del medio con la misma red y el mismo usuario? (la BD no distingue mayúsculas). */
export function esRepetida(
  existentes: readonly CuentaExistente[],
  plataforma: Plataforma,
  handle: string,
  propiaId: string | null
): boolean {
  const buscado = handle.toLocaleLowerCase("es-CO")
  return existentes.some(
    (cuenta) =>
      cuenta.id !== propiaId &&
      cuenta.plataforma === plataforma &&
      cuenta.handle.toLocaleLowerCase("es-CO") === buscado
  )
}

function SelectorPlataforma({
  valor,
  onCambio,
  invalido,
  deshabilitado,
  idError,
  idEtiqueta,
}: {
  valor: string
  onCambio: (valor: Plataforma) => void
  invalido: boolean
  deshabilitado: boolean
  idError: string
  idEtiqueta: string
}) {
  return (
    <RadioGroup
      value={valor}
      onValueChange={(nuevo) => onCambio(nuevo as Plataforma)}
      disabled={deshabilitado}
      aria-invalid={invalido || undefined}
      aria-labelledby={idEtiqueta}
      aria-describedby={invalido ? idError : undefined}
      className="grid grid-cols-3 gap-2"
    >
      {ORDEN_PLATAFORMAS.map((plataforma) => (
        <label
          key={plataforma}
          className="flex h-12 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border bg-background/60 px-1.5 text-sm transition-colors select-none hover:bg-muted/60 has-data-checked:border-primary has-data-checked:bg-primary/8 has-data-checked:font-medium has-data-disabled:cursor-not-allowed has-data-disabled:opacity-60 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 dark:bg-input/20"
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
  )
}

/** «Lo guardaremos como @usuario · instagram.com/usuario». */
function VistaPerfil({
  plataforma,
  perfil,
}: {
  plataforma: string
  perfil: string
}) {
  if (!(plataforma in PLATAFORMAS) || !perfil.trim()) return null
  const resultado = interpretarPerfil(plataforma as Plataforma, perfil)
  if (!resultado.ok) return null
  return (
    <p className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground">
      <CircleCheck
        aria-hidden
        className="mt-px size-3.5 shrink-0 text-success"
      />
      <span className="min-w-0 break-words">
        Lo guardaremos como{" "}
        <span className="font-medium text-foreground">
          {formatearHandle(resultado.handle)}
        </span>{" "}
        · {urlLegible(resultado.url)}
      </span>
    </p>
  )
}

/**
 * Alta y edición de una cuenta social: red (fija al editar), usuario o enlace
 * del perfil (validado según la red, con la forma en que se guardará) y la
 * tarifa de referencia, que es solo informativa.
 */
export function FormularioCuenta({
  id,
  edicion,
  existentes,
  onPendiente,
  onGuardada,
}: FormularioCuentaProps) {
  const ids = useId()
  const idPerfil = `${ids}-perfil`
  const idTarifa = `${ids}-tarifa`
  const idErrorPlataforma = `${ids}-plataforma-error`
  const idLeyendaPlataforma = `${ids}-plataforma`
  const perfilInicial = edicion ? formatearHandle(edicion.cuenta.handle) : null
  const esquema = useMemo(
    () => esquemaFormularioCuenta(perfilInicial),
    [perfilInicial]
  )
  const formulario = useForm({
    resolver: zodResolver(esquema),
    defaultValues: valoresIniciales(edicion),
    mode: "onTouched",
  })
  const { control, register, formState, setError } = formulario
  const plataforma = useWatch({ control, name: "plataforma" })
  const perfil = useWatch({ control, name: "perfil" })
  const [, iniciar] = useTransition()
  const errorGeneral = formState.errors.root?.servidor?.message
  const plataformaElegida =
    plataforma in PLATAFORMAS ? (plataforma as Plataforma) : null
  const ejemplo = plataformaElegida
    ? EJEMPLOS_PERFIL[plataformaElegida]
    : { usuario: "@tumedio", enlace: "" }

  function marcarRepetida() {
    const mensaje = MENSAJES_CUENTAS.cuentaRepetida
    aplicarErroresServidor(
      setError,
      fallo(mensaje, { perfil: [mensaje] }),
      CAMPOS_CUENTA
    )
  }

  // Se envían los valores tal como se escribieron: el servidor aplica el mismo
  // esquema. Al editar, un perfil sin cambios viaja como `null`.
  const enviar = formulario.handleSubmit((datos) =>
    iniciar(async () => {
      const valores = formulario.getValues()
      const nuevo = perfilNuevo(datos.plataforma, valores.perfil, perfilInicial)
      if (
        nuevo &&
        esRepetida(
          existentes,
          datos.plataforma,
          nuevo,
          edicion?.cuenta.id ?? null
        )
      ) {
        marcarRepetida()
        return
      }
      onPendiente(true)
      try {
        const resultado = edicion
          ? await editarCuenta({
              ...valores,
              perfil: nuevo ? valores.perfil : null,
              cuentaId: edicion.cuenta.id,
              actualizadaAt: edicion.cuenta.actualizadaAt,
            })
          : await registrarCuenta(valores)
        if (!resultado.ok) {
          aplicarErroresServidor(setError, resultado, CAMPOS_CUENTA)
          return
        }
        onGuardada(resultado.datos, nuevo ?? edicion?.cuenta.handle ?? "")
      } finally {
        onPendiente(false)
      }
    })
  )

  return (
    <form id={id} onSubmit={enviar} noValidate>
      <FieldGroup>
        {errorGeneral ? (
          <Alert variant="destructive">
            <AlertDescription>{errorGeneral}</AlertDescription>
          </Alert>
        ) : null}

        <Controller
          control={control}
          name="plataforma"
          render={({ field, fieldState }) => (
            <FieldSet data-invalid={fieldState.invalid || undefined}>
              <FieldLegend id={idLeyendaPlataforma} variant="label">
                Red social
              </FieldLegend>
              {edicion ? (
                <div className="flex h-11 items-center gap-2 rounded-lg border bg-muted/40 px-3">
                  <MarcaPlataforma
                    plataforma={edicion.cuenta.plataforma}
                    conNombre
                  />
                  <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                    <Lock aria-hidden className="size-3.5" />
                    No se cambia
                  </span>
                </div>
              ) : (
                <SelectorPlataforma
                  valor={field.value}
                  onCambio={(valor) => {
                    field.onChange(valor)
                    field.onBlur()
                  }}
                  invalido={fieldState.invalid}
                  deshabilitado={formState.isSubmitting}
                  idError={idErrorPlataforma}
                  idEtiqueta={idLeyendaPlataforma}
                />
              )}
              <FieldError id={idErrorPlataforma} errors={[fieldState.error]} />
            </FieldSet>
          )}
        />

        <Field data-invalid={formState.errors.perfil ? true : undefined}>
          <FieldLabel htmlFor={idPerfil}>
            Usuario o enlace del perfil
          </FieldLabel>
          <InputGroup className="h-11">
            <InputGroupAddon align="inline-start" className="pl-3">
              {perfil.includes("/") ? (
                <Link2 aria-hidden className="size-4 text-muted-foreground" />
              ) : (
                <AtSign aria-hidden className="size-4 text-muted-foreground" />
              )}
            </InputGroupAddon>
            <InputGroupInput
              id={idPerfil}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="url"
              maxLength={LARGO_MAXIMO_ENTRADA}
              placeholder={ejemplo.usuario}
              readOnly={Boolean(edicion?.perfilBloqueado)}
              aria-invalid={formState.errors.perfil ? true : undefined}
              aria-describedby={`${idPerfil}-ayuda`}
              className="h-full text-[0.9375rem] read-only:text-muted-foreground md:text-[0.9375rem]"
              {...register("perfil")}
            />
          </InputGroup>
          <FieldDescription id={`${idPerfil}-ayuda`}>
            {edicion?.perfilBloqueado ??
              (plataformaElegida
                ? `Escribe el usuario (${ejemplo.usuario}) o pega el enlace de tu perfil de ${PLATAFORMAS[plataformaElegida]}.`
                : "Elige la red y escribe el usuario o pega el enlace de tu perfil.")}
          </FieldDescription>
          {formState.errors.perfil ? null : (
            <VistaPerfil plataforma={plataforma} perfil={perfil} />
          )}
          <FieldError errors={[formState.errors.perfil]} />
        </Field>

        <Field data-invalid={formState.errors.tarifa ? true : undefined}>
          <FieldLabel htmlFor={idTarifa}>
            Tarifa de referencia{" "}
            <span className="font-normal text-muted-foreground">
              (opcional)
            </span>
          </FieldLabel>
          <InputGroup className="h-11">
            <InputGroupAddon align="inline-start" className="pl-3">
              <span aria-hidden className="text-sm text-muted-foreground">
                $
              </span>
            </InputGroupAddon>
            <InputGroupInput
              id={idTarifa}
              inputMode="numeric"
              autoComplete="off"
              placeholder="250.000"
              aria-invalid={formState.errors.tarifa ? true : undefined}
              aria-describedby={`${idTarifa}-ayuda`}
              className="h-full text-[0.9375rem] cifras md:text-[0.9375rem]"
              {...register("tarifa")}
            />
          </InputGroup>
          <FieldDescription id={`${idTarifa}-ayuda`}>
            Lo que cobras normalmente por una publicación en esta cuenta, en
            pesos. Es solo una referencia: en AMO el precio de cada oferta lo
            calcula la plataforma.
          </FieldDescription>
          <FieldError errors={[formState.errors.tarifa]} />
        </Field>
      </FieldGroup>
    </form>
  )
}
