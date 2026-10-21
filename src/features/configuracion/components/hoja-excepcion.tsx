"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { BadgePercent, Building2, Megaphone } from "lucide-react"
import { useState } from "react"
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { ControlSegmentado } from "@/features/roles/components/control-segmentado"
import { formatearFecha, formatearPorcentaje } from "@/lib/format"

import { guardarExcepcion } from "../actions"
import { valoresExcepcion } from "../formularios"
import { textoANumero } from "../numeros"
import { type EntradaExcepcion, esquemaExcepcion } from "../schemas"
import type { ExcepcionComision, ObjetivoComision } from "../tipos"
import { decimalesPorcentaje, porcentajeAFraccion } from "../valores"
import { estadoVigencia, hoyBogota } from "../vigencias"
import {
  CampoAreaTexto,
  CampoCifra,
  CampoFecha,
  CampoInterruptor,
} from "./campos"
import { usePermisosConfiguracion } from "./contexto-configuracion"
import { FormularioHoja, HojaLateral, useHojaLateral } from "./hoja-lateral"
import { RepartoComision } from "./reparto-comision"
import { SelectorObjetivo } from "./selector-objetivo"
import { useEnvio } from "./use-envio"

const CAMPOS = [
  "objetivoId",
  "porcentaje",
  "desde",
  "hasta",
  "motivo",
] as const satisfies readonly (keyof EntradaExcepcion)[]

/** Crea o edita una comisión de excepción (por anunciante o por campaña). */
export function HojaExcepcion({
  abierta,
  onAbiertaChange,
  excepcion,
  comisionGlobal,
}: {
  abierta: boolean
  onAbiertaChange: (abierta: boolean) => void
  /** `null` para crear una nueva. */
  excepcion: ExcepcionComision | null
  comisionGlobal: number | null
}) {
  return (
    <HojaLateral
      abierta={abierta}
      onAbiertaChange={onAbiertaChange}
      icono={BadgePercent}
      titulo={
        excepcion
          ? "Editar comisión de excepción"
          : "Nueva comisión de excepción"
      }
      descripcion={
        excepcion
          ? excepcion.objetivo.nombre
          : "Una comisión distinta de la global para un anunciante o una campaña, durante un periodo."
      }
    >
      <FormularioExcepcion
        excepcion={excepcion}
        comisionGlobal={comisionGlobal}
      />
    </HojaLateral>
  )
}

function FormularioExcepcion({
  excepcion,
  comisionGlobal,
}: {
  excepcion: ExcepcionComision | null
  comisionGlobal: number | null
}) {
  const { cerrar } = useHojaLateral()
  const { datosSensibles } = usePermisosConfiguracion()
  const formulario = useForm({
    resolver: zodResolver(esquemaExcepcion),
    defaultValues: valoresExcepcion(excepcion),
    mode: "onTouched",
  })
  const { control } = formulario
  const [elegido, setElegido] = useState<ObjetivoComision | null>(
    excepcion?.objetivo ?? null
  )
  const { enviar, pendiente, errorGeneral, sucio } = useEnvio({
    formulario,
    accion: guardarExcepcion,
    campos: CAMPOS,
    onExito: () => {
      toast.success(excepcion ? "Excepción actualizada" : "Excepción creada", {
        description: elegido?.nombre,
      })
      cerrar()
    },
  })

  const objetivo = useWatch({ control, name: "objetivo" })
  const desdeAhora = useWatch({ control, name: "desdeAhora" })
  const desde = useWatch({ control, name: "desde" })
  const textoPorcentaje = useWatch({ control, name: "porcentaje" })
  const numero = textoANumero(String(textoPorcentaje ?? ""))
  const fraccion = numero === null ? null : porcentajeAFraccion(numero)
  // Una excepción que ya empezó conserva su inicio (el servidor también lo impone).
  const yaEmpezo =
    excepcion !== null &&
    estadoVigencia(excepcion.vigenteDesde, excepcion.vigenteHasta) !==
      "PROGRAMADA"
  const hoy = hoyBogota()

  return (
    <FormProvider {...formulario}>
      <FormularioHoja
        onEnviar={enviar}
        pendiente={pendiente}
        sucio={sucio}
        errorGeneral={errorGeneral}
        textoEnviar={excepcion ? "Guardar cambios" : "Crear excepción"}
      >
        {excepcion ? null : (
          <Field>
            <FieldLabel>Aplica a</FieldLabel>
            <ControlSegmentado
              etiqueta="A quién aplica la excepción"
              opciones={[
                { valor: "anunciante", etiqueta: "Un anunciante" },
                { valor: "campana", etiqueta: "Una campaña" },
              ]}
              valor={objetivo}
              onCambio={(valor) => {
                formulario.setValue("objetivo", valor, { shouldDirty: true })
                formulario.setValue("objetivoId", "", { shouldDirty: true })
                setElegido(null)
              }}
            />
            <FieldDescription>
              Si una campaña y su anunciante tienen excepción, manda la de la
              campaña.
            </FieldDescription>
          </Field>
        )}

        <Controller
          control={control}
          name="objetivoId"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor="excepcion-objetivo">
                {objetivo === "anunciante" ? "Anunciante" : "Campaña"}
              </FieldLabel>
              <SelectorObjetivo
                id="excepcion-objetivo"
                tipo={objetivo}
                valor={elegido}
                deshabilitado={excepcion !== null || pendiente}
                invalido={fieldState.invalid}
                buscaPorNit={datosSensibles}
                onCambio={(seleccion) => {
                  setElegido(seleccion)
                  field.onChange(seleccion.id)
                  field.onBlur()
                }}
              />
              {excepcion ? (
                <FieldDescription>
                  El destinatario no se cambia: crea otra excepción si hace
                  falta.
                </FieldDescription>
              ) : null}
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <div className="flex flex-col gap-3">
          <CampoCifra
            nombre="porcentaje"
            etiqueta="Comisión"
            sufijo="%"
            decimal
            placeholder="15"
            deshabilitado={pendiente}
            descripcion={
              comisionGlobal !== null
                ? `La comisión global es ${formatearPorcentaje(comisionGlobal, decimalesPorcentaje(comisionGlobal))}. Admite de 0% a 50%.`
                : "Admite de 0% a 50%."
            }
          />
          {fraccion !== null && fraccion >= 0 && fraccion <= 0.5 ? (
            <RepartoComision
              porcentaje={fraccion}
              className="rounded-lg border bg-muted/20 p-3"
            />
          ) : null}
        </div>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-3 text-sm font-medium">Vigencia</legend>
          {yaEmpezo && excepcion ? (
            <p className="rounded-lg border bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground">
              Empezó el{" "}
              <span className="font-medium text-foreground">
                {formatearFecha(excepcion.vigenteDesde, "largo")}
              </span>
              ; su inicio ya no se puede mover.
            </p>
          ) : (
            <>
              <CampoInterruptor
                nombre="desdeAhora"
                etiqueta="Aplicar desde ahora"
                descripcion="Las asignaciones que se acepten desde este momento usan la excepción."
                deshabilitado={pendiente}
              />
              {desdeAhora ? null : (
                <CampoFecha
                  nombre="desde"
                  etiqueta="Desde"
                  minimo={hoy}
                  descripcion="Empieza a las 00:00 (hora de Colombia) de ese día."
                  deshabilitado={pendiente}
                />
              )}
            </>
          )}
          <CampoFecha
            nombre="hasta"
            etiqueta="Hasta"
            opcional
            minimo={desdeAhora || yaEmpezo ? hoy : desde || hoy}
            placeholder="Sin fecha de fin"
            descripcion="Incluye todo ese día. Sin fecha, sigue vigente hasta que la finalices."
            deshabilitado={pendiente}
          />
        </fieldset>

        <CampoAreaTexto
          nombre="motivo"
          etiqueta="Motivo"
          filas={3}
          placeholder="Acuerdo comercial de lanzamiento, volumen anual…"
          descripcion="Queda en la bitácora junto con el cambio."
          deshabilitado={pendiente}
        />

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          {objetivo === "anunciante" ? (
            <Building2 aria-hidden className="size-3.5" />
          ) : (
            <Megaphone aria-hidden className="size-3.5" />
          )}
          Las asignaciones ya aceptadas conservan la comisión con la que se
          cotizaron.
        </p>
      </FormularioHoja>
    </FormProvider>
  )
}
