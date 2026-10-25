"use client"

import { useEffect, useId } from "react"
import { Controller, useFormContext, useWatch } from "react-hook-form"

import { Checkbox } from "@/components/ui/checkbox"
import {
  FieldDescription,
  FieldError,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import {
  CampoCifra,
  CampoInterruptor,
} from "@/features/configuracion/components/campos"
import { CORTES } from "@/features/operacion/estados"
import { parsearFecha } from "@/lib/fechas"
import {
  formatearFecha,
  formatearFechaHora,
  formatearNumero,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import { porcentajeRecargo } from "../estimador"
import { minimoFechaLimite, separarFechaHora } from "../instantes"
import { CORTES_OFERTA, type ValoresOferta } from "../schemas"
import type { CampanaAsistente, ConfiguracionAsistente } from "../tipos"
import { CampoFechaHora } from "./campo-fecha-hora"

export interface PropsPasoCuando {
  campana: Pick<CampanaAsistente, "fechaInicio" | "fechaFin">
  configuracion: Pick<
    ConfiguracionAsistente,
    "anticipacionHoras" | "recargoExclusividad" | "cortesPorDefecto"
  >
  /** Momento de la página (para el primer día elegible de la fecha límite). */
  ahora: Date
}

function textoHoras(horas: number): string {
  return `${formatearNumero(horas)} ${horas === 1 ? "hora" : "horas"}`
}

/**
 * Paso 3 · Cuándo (ANU-006): ventana de publicación dentro de la campaña,
 * fecha límite de aceptación (con la anticipación mínima), permanencia,
 * cortes de métricas (los de la configuración, se pueden quitar) y
 * exclusividad opcional con su recargo a la vista.
 */
export function PasoCuando({ campana, configuracion, ahora }: PropsPasoCuando) {
  const { control, clearErrors } = useFormContext<ValoresOferta>()
  const [ventanaFin, exclusividad] = useWatch({
    control,
    name: ["cuando.ventanaFin", "cuando.exclusividad"],
  })
  // Sin exclusividad, sus días ni se ven ni se validan: un error que quedó
  // marcado no debe seguir señalando el paso.
  useEffect(() => {
    if (!exclusividad) clearErrors("cuando.exclusividadDias")
  }, [exclusividad, clearErrors])
  const ultimoDia = campana.fechaFin
  // Publicar en días ya pasados no tiene sentido: el calendario empieza hoy.
  const hoy = separarFechaHora(ahora.toISOString()).dia
  const primerDia = campana.fechaInicio > hoy ? campana.fechaInicio : hoy
  const diaMinimoLimite = separarFechaHora(
    minimoFechaLimite(ahora, configuracion.anticipacionHoras).toISOString()
  ).dia
  const diaMaximoLimite = separarFechaHora(ventanaFin).dia || ultimoDia
  const recargo = porcentajeRecargo(configuracion.recargoExclusividad)

  return (
    <div className="flex flex-col gap-7">
      <FieldSet className="gap-3">
        <FieldLegend variant="label" className="mb-0 text-[0.9375rem]">
          Ventana de publicación
        </FieldLegend>
        <FieldDescription className="-mt-1">
          Cuándo pueden publicar los medios: dentro de la campaña, del{" "}
          {formatearFecha(parsearFecha(campana.fechaInicio), "largo")} al{" "}
          {formatearFecha(parsearFecha(campana.fechaFin), "largo")}.
        </FieldDescription>
        <div className="grid gap-5 md:grid-cols-2">
          <CampoFechaHora
            nombre="cuando.ventanaInicio"
            etiqueta="Inicio de la ventana"
            diaMinimo={primerDia}
            diaMaximo={ultimoDia}
            horaPorDefecto="08:00"
          />
          <CampoFechaHora
            nombre="cuando.ventanaFin"
            etiqueta="Fin de la ventana"
            diaMinimo={primerDia}
            diaMaximo={ultimoDia}
            horaPorDefecto="23:59"
          />
        </div>
      </FieldSet>

      <CampoFechaHora
        nombre="cuando.fechaLimite"
        etiqueta="Fecha límite para aceptar"
        className="md:max-w-[calc(50%-0.625rem)]"
        diaMinimo={diaMinimoLimite}
        diaMaximo={diaMaximoLimite}
        horaPorDefecto="18:00"
        descripcion={
          configuracion.anticipacionHoras > 0
            ? `Hasta cuándo pueden tomar un cupo. Debe quedar al menos ${textoHoras(configuracion.anticipacionHoras)} después de enviarla a revisión (si la envías hoy, desde el ${formatearFechaHora(minimoFechaLimite(ahora, configuracion.anticipacionHoras))}) y no después del fin de la ventana.`
            : "Hasta cuándo pueden tomar un cupo. No puede pasar del fin de la ventana."
        }
      />

      <CampoCifra
        nombre="cuando.permanenciaDias"
        etiqueta="Permanencia mínima"
        sufijo="días"
        className="max-w-xs"
        descripcion="Cuánto tiempo debe seguir visible cada publicación. Si exiges el corte de 7 días, conviene que sean al menos 7."
      />

      <CampoCortes cortesPorDefecto={configuracion.cortesPorDefecto} />

      <div className="flex flex-col gap-3">
        <CampoInterruptor
          nombre="cuando.exclusividad"
          etiqueta="Exclusividad de sector"
          descripcion={`Durante esos días el medio no publica para otras marcas del mismo sector. El precio de cada medio sube ${recargo}.`}
        />
        {exclusividad ? (
          <CampoCifra
            nombre="cuando.exclusividadDias"
            etiqueta="Días de exclusividad"
            sufijo="días"
            className="max-w-xs"
            descripcion={`De 1 a 90 días. El estimador ya incluye el recargo de ${recargo}.`}
          />
        ) : null}
      </div>
    </div>
  )
}

/** Cortes de métricas exigidos (al menos uno). */
function CampoCortes({
  cortesPorDefecto,
}: {
  cortesPorDefecto: readonly string[]
}) {
  const { control } = useFormContext<ValoresOferta>()
  const idAyuda = useId()
  const idError = useId()
  const sugeridos = CORTES_OFERTA.filter((corte) =>
    cortesPorDefecto.includes(corte)
  )
    .map((corte) => CORTES[corte].etiqueta)
    .join(", ")
  return (
    <Controller
      control={control}
      name="cuando.cortes"
      render={({ field, fieldState }) => (
        <FieldSet
          aria-describedby={idAyuda}
          data-invalid={fieldState.invalid || undefined}
          className="gap-2"
        >
          <FieldLegend variant="label" className="mb-0">
            Cortes de métricas
          </FieldLegend>
          <FieldDescription id={idAyuda}>
            Cuándo reporta cada medio las métricas de su publicación. AMO
            sugiere: {sugeridos}. Quita los que no necesites.
          </FieldDescription>
          <div className="flex flex-wrap gap-2">
            {CORTES_OFERTA.map((corte) => {
              const marcado = field.value.includes(corte)
              return (
                <label
                  key={corte}
                  className={cn(
                    "inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border bg-background px-3.5 text-sm transition-colors select-none hover:bg-muted/60 sm:h-9",
                    "has-data-checked:border-primary/40 has-data-checked:bg-primary/10 dark:has-data-checked:bg-primary/15",
                    "has-focus-visible:anillo-foco"
                  )}
                >
                  <Checkbox
                    checked={marcado}
                    aria-invalid={fieldState.invalid || undefined}
                    aria-describedby={fieldState.invalid ? idError : undefined}
                    onCheckedChange={(valor) => {
                      const siguientes =
                        valor === true
                          ? [...field.value, corte]
                          : field.value.filter((c) => c !== corte)
                      field.onChange(
                        CORTES_OFERTA.filter((c) => siguientes.includes(c))
                      )
                      field.onBlur()
                    }}
                  />
                  <span>{CORTES[corte].etiqueta}</span>
                </label>
              )
            })}
          </div>
          <FieldError id={idError} errors={[fieldState.error]} />
        </FieldSet>
      )}
    />
  )
}
