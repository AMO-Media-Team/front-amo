"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { MapPinPlus, Minus, Plus, SlidersHorizontal } from "lucide-react"
import { useId, useState, useTransition } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { SelectorTerritorio } from "@/components/territorio/selector-territorio"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  FormularioHoja,
  HojaLateral,
} from "@/features/configuracion/components/hoja-lateral"
import { InsigniaTono } from "@/features/operacion/components/distintivos"
import { aplicarErroresServidor } from "@/features/usuarios/components/errores-formulario"

import { agregarPertinencia, editarPertinencia } from "../actions"
import {
  efectoMultiplicador,
  type FilaPertinencia,
  LARGO_MAXIMO_NOTAS,
  MULTIPLICADOR_NEUTRO,
  PASO_MULTIPLICADOR,
  parsearMultiplicador,
  pasoMultiplicador,
  textoMultiplicador,
} from "../pertinencia"
import { esquemaPertinencia } from "../schemas"

const CAMPOS = ["municipioCodigo", "multiplicador", "notas"] as const

/** Valores frecuentes: un toque los fija (se pueden ajustar con − y +). */
const ATAJOS_MULTIPLICADOR = [0.8, 0.9, 1.1, 1.2, 1.3] as const

function CampoMultiplicador({
  id,
  valor,
  onCambio,
  onBlur,
  invalido,
  error,
  deshabilitado,
}: {
  id: string
  valor: number
  onCambio: (valor: number) => void
  onBlur: () => void
  invalido: boolean
  error: { message?: string } | undefined
  deshabilitado: boolean
}) {
  const [texto, setTexto] = useState(() =>
    Number.isFinite(valor) ? textoMultiplicador(valor) : ""
  )
  const efecto = Number.isFinite(valor) ? efectoMultiplicador(valor) : null

  function fijar(nuevo: number) {
    setTexto(textoMultiplicador(nuevo))
    onCambio(nuevo)
  }

  return (
    <Field data-invalid={invalido ? true : undefined}>
      <FieldLabel htmlFor={id}>Multiplicador</FieldLabel>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          disabled={deshabilitado}
          aria-label="Bajar 0,05"
          onClick={() => fijar(pasoMultiplicador(valor, -PASO_MULTIPLICADOR))}
        >
          <Minus aria-hidden />
        </Button>
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={texto}
          disabled={deshabilitado}
          onChange={(evento) => {
            setTexto(evento.target.value)
            onCambio(parsearMultiplicador(evento.target.value) ?? Number.NaN)
          }}
          onBlur={() => {
            if (Number.isFinite(valor)) setTexto(textoMultiplicador(valor))
            onBlur()
          }}
          aria-invalid={invalido ? true : undefined}
          aria-describedby={`${id}-ayuda ${id}-efecto`}
          className="h-9 max-w-28 text-center text-base cifras"
        />
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          disabled={deshabilitado}
          aria-label="Subir 0,05"
          onClick={() => fijar(pasoMultiplicador(valor, PASO_MULTIPLICADOR))}
        >
          <Plus aria-hidden />
        </Button>
        <span id={`${id}-efecto`} aria-live="polite" className="min-w-0">
          {efecto ? (
            <InsigniaTono tono={efecto.tono} etiqueta={efecto.texto} />
          ) : null}
        </span>
      </div>
      <div
        role="group"
        aria-label="Valores frecuentes"
        className="flex flex-wrap gap-1.5"
      >
        {ATAJOS_MULTIPLICADOR.map((atajo) => (
          <Button
            key={atajo}
            type="button"
            variant="outline"
            size="sm"
            disabled={deshabilitado}
            aria-pressed={valor === atajo}
            onClick={() => fijar(atajo)}
            className="cifras"
          >
            {textoMultiplicador(atajo)}
          </Button>
        ))}
      </div>
      <FieldDescription id={`${id}-ayuda`}>
        De 0,500 a 1,500. 1,000 deja el precio igual; más de 1 lo sube cuando la
        oferta se dirige a este municipio y menos de 1 lo baja.
      </FieldDescription>
      <FieldError errors={[error]} />
    </Field>
  )
}

/**
 * Alta o edición de la pertinencia de un municipio (ADM-006). Al editar, el
 * municipio queda fijo (es la clave); para cambiarlo se quita y se agrega.
 */
export function HojaPertinencia({
  abierta,
  onAbiertaChange,
  medio,
  fila,
  clasificados,
}: {
  abierta: boolean
  onAbiertaChange: (abierta: boolean) => void
  medio: { id: string; nombre: string }
  /** `null` para clasificar un municipio nuevo. */
  fila: FilaPertinencia | null
  /** Municipios que ya tienen clasificación (para avisar antes de enviar). */
  clasificados: ReadonlySet<string>
}) {
  return (
    <HojaLateral
      abierta={abierta}
      onAbiertaChange={onAbiertaChange}
      icono={fila ? SlidersHorizontal : MapPinPlus}
      titulo={
        fila ? `Pertinencia en ${fila.municipio}` : "Clasificar municipio"
      }
      descripcion={`Multiplicador geográfico de ${medio.nombre}.`}
    >
      <Formulario
        medio={medio}
        fila={fila}
        clasificados={clasificados}
        onGuardado={() => onAbiertaChange(false)}
      />
    </HojaLateral>
  )
}

function Formulario({
  medio,
  fila,
  clasificados,
  onGuardado,
}: {
  medio: { id: string; nombre: string }
  fila: FilaPertinencia | null
  clasificados: ReadonlySet<string>
  onGuardado: () => void
}) {
  const id = useId()
  const formulario = useForm({
    resolver: zodResolver(esquemaPertinencia),
    defaultValues: {
      medioId: medio.id,
      municipioCodigo: fila?.municipioCodigo ?? "",
      multiplicador: fila?.multiplicador ?? MULTIPLICADOR_NEUTRO,
      notas: fila?.notas ?? "",
    },
    mode: "onTouched",
  })
  const { control, register, formState, handleSubmit, getValues, setError } =
    formulario
  const [pendiente, iniciar] = useTransition()
  const municipio = useWatch({ control, name: "municipioCodigo" })
  const repetido = !fila && clasificados.has(municipio)

  const enviar = handleSubmit(() =>
    iniciar(async () => {
      const entrada = getValues()
      const resultado = fila
        ? await editarPertinencia(entrada)
        : await agregarPertinencia(entrada)
      if (!resultado.ok) {
        aplicarErroresServidor(setError, resultado, CAMPOS)
        return
      }
      toast.success(
        fila ? "Pertinencia actualizada" : "Municipio clasificado",
        {
          description: medio.nombre,
        }
      )
      onGuardado()
    })
  )

  return (
    <FormularioHoja
      onEnviar={enviar}
      pendiente={pendiente}
      sucio={formState.isDirty}
      errorGeneral={formState.errors.root?.servidor?.message}
      textoEnviar={fila ? "Guardar cambios" : "Clasificar"}
      envioDeshabilitado={repetido}
    >
      {fila ? (
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-medium text-muted-foreground">Municipio</p>
          <p className="text-sm font-medium">
            {fila.municipio}
            {fila.departamento ? `, ${fila.departamento}` : ""}
          </p>
        </div>
      ) : (
        <Controller
          control={control}
          name="municipioCodigo"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || repetido || undefined}>
              <SelectorTerritorio
                modo="municipio"
                id={`${id}-municipio`}
                valor={field.value}
                invalido={fieldState.invalid || repetido}
                deshabilitado={pendiente}
                describedBy={`${id}-municipio-error`}
                onCambio={(elegido) => {
                  field.onChange(elegido?.codigo ?? "")
                  field.onBlur()
                }}
              />
              <FieldError id={`${id}-municipio-error`}>
                {repetido
                  ? "Ese municipio ya está clasificado: edítalo en la lista."
                  : fieldState.error?.message}
              </FieldError>
            </Field>
          )}
        />
      )}

      <Controller
        control={control}
        name="multiplicador"
        render={({ field, fieldState }) => (
          <CampoMultiplicador
            id={`${id}-multiplicador`}
            valor={field.value}
            onCambio={field.onChange}
            onBlur={field.onBlur}
            invalido={fieldState.invalid}
            error={fieldState.error}
            deshabilitado={pendiente}
          />
        )}
      />

      <Field data-invalid={formState.errors.notas ? true : undefined}>
        <FieldLabel htmlFor={`${id}-notas`}>
          Notas{" "}
          <span className="font-normal text-muted-foreground">(opcional)</span>
        </FieldLabel>
        <Textarea
          id={`${id}-notas`}
          rows={3}
          maxLength={LARGO_MAXIMO_NOTAS}
          disabled={pendiente}
          placeholder="Ej.: Sede del medio y la mayor parte de su audiencia."
          aria-invalid={formState.errors.notas ? true : undefined}
          {...register("notas")}
        />
        <FieldDescription>
          Por qué este valor, para quien lo revise después.
        </FieldDescription>
        <FieldError errors={[formState.errors.notas]} />
      </Field>
    </FormularioHoja>
  )
}
