"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  ArrowRight,
  CalendarClock,
  CalendarPlus,
  Tags,
  Undo2,
} from "lucide-react"
import { useState } from "react"
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  calcularDelta,
  formatearCOP,
  formatearDelta,
  formatearFecha,
  formatearFechaHora,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import { cancelarTarifaProgramada, programarTarifa } from "../actions"
import { valoresProgramarTarifa } from "../formularios"
import { numeroAEntrada, textoANumero } from "../numeros"
import {
  nombrePlataforma,
  NOMBRES_FORMATO,
  rangoSeguidores,
} from "../presentacion"
import {
  type EntradaProgramarTarifa,
  esquemaProgramarTarifa,
  INICIOS_TARIFA,
  type InicioTarifa,
} from "../schemas"
import {
  inicioProgramable,
  inicioSugerido,
  inicioUltimaProgramada,
} from "../tarifas"
import type { Formato, Franja, Tarifa } from "../tipos"
import {
  ETIQUETAS_PRESET_INICIO,
  type EstadoVigencia,
  hoyBogota,
  inicioPreset,
  instanteBogota,
  textoVigencia,
} from "../vigencias"
import { CampoCifra, CampoFecha, CampoHora } from "./campos"
import {
  CuerpoHoja,
  FormularioHoja,
  HojaLateral,
  useHojaLateral,
} from "./hoja-lateral"
import { InsigniaPendiente, InsigniaVigencia } from "./insignias"
import { useEnvio } from "./use-envio"

export interface CeldaElegida {
  formato: Formato
  franja: Franja
  /** Versiones de la celda (más reciente primero) con su estado. */
  versiones: (Tarifa & { estado: EstadoVigencia })[]
}

const CAMPOS = [
  "valor",
  "inicio",
  "dia",
  "hora",
] as const satisfies readonly (keyof EntradaProgramarTarifa)[]

const DESCRIPCION_INICIO: Readonly<Record<InicioTarifa, string>> = {
  pronto: "En un minuto. Las cotizaciones en curso usan la nueva tarifa.",
  manana: "",
  lunes: "",
  mes: "",
  fecha: "Elige el día y la hora (hora de Colombia).",
}

function inicioEstimado(
  inicio: InicioTarifa,
  dia: string,
  hora: string,
  ahora: Date
): Date | null {
  switch (inicio) {
    case "pronto":
      return new Date(ahora.getTime() + 60_000)
    case "fecha":
      return instanteBogota(dia, hora || "00:00")
    default:
      return inicioPreset(inicio, ahora)
  }
}

function tituloCelda(celda: CeldaElegida): string {
  return `${nombrePlataforma(celda.formato.plataforma)} · ${celda.formato.nombre} · ${celda.franja.nombre}`
}

/**
 * Una celda del tarifario: la tarifa vigente, la programada (que se puede
 * cancelar), el historial de versiones y el formulario para programar una
 * nueva vigencia. Las tarifas nunca se sobrescriben.
 */
export function HojaTarifa({
  abierta,
  onAbiertaChange,
  celda,
  puedeProgramar,
}: {
  abierta: boolean
  onAbiertaChange: (abierta: boolean) => void
  celda: CeldaElegida | null
  puedeProgramar: boolean
}) {
  return (
    <HojaLateral
      abierta={abierta}
      onAbiertaChange={onAbiertaChange}
      icono={Tags}
      titulo="Tarifa base"
      descripcion={celda ? tituloCelda(celda) : undefined}
      ancho="lg"
    >
      {celda ? (
        puedeProgramar ? (
          <FormularioTarifa celda={celda} />
        ) : (
          <CuerpoHoja>
            <ResumenCelda celda={celda} puedeCancelar={false} />
          </CuerpoHoja>
        )
      ) : null}
    </HojaLateral>
  )
}

function ResumenCelda({
  celda,
  puedeCancelar,
}: {
  celda: CeldaElegida
  puedeCancelar: boolean
}) {
  const [cancelar, setCancelar] = useState<Tarifa | null>(null)
  const vigente = celda.versiones.find((v) => v.estado === "VIGENTE") ?? null
  const programadas = celda.versiones
    .filter((v) => v.estado === "PROGRAMADA")
    .sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">
          {NOMBRES_FORMATO[celda.formato.clave] ?? celda.formato.nombre} ·{" "}
          {rangoSeguidores(
            celda.franja.seguidoresMin,
            celda.franja.seguidoresMax
          )}
        </p>
        {vigente ? (
          <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
            <span className="font-heading text-3xl font-bold cifras">
              {formatearCOP(vigente.valorBase)}
            </span>
            <span className="pb-1 text-sm text-muted-foreground">
              vigente desde el {formatearFecha(vigente.vigenteDesde, "largo")}
            </span>
            {vigente.pendienteValidacion ? (
              <InsigniaPendiente className="mb-1" />
            ) : null}
          </div>
        ) : (
          <p className="text-sm font-medium text-warning">
            Esta celda no tiene tarifa vigente: las cuentas de esta franja no
            pueden cotizar este formato.
          </p>
        )}
      </div>

      {programadas.map((programada) => (
        <div
          key={programada.id}
          className="flex flex-col gap-3 rounded-xl border border-info/30 bg-info/6 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 gap-3">
            <CalendarClock
              aria-hidden
              className="mt-0.5 size-5 shrink-0 text-info"
            />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-sm font-medium">
                Programada:{" "}
                <span className="cifras">
                  {formatearCOP(programada.valorBase)}
                </span>
                {vigente ? (
                  <span className="ml-2 text-xs font-normal cifras text-muted-foreground">
                    {formatearDelta(
                      calcularDelta(programada.valorBase, vigente.valorBase)
                    )}
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-muted-foreground">
                Entra en vigor el {formatearFechaHora(programada.vigenteDesde)}
              </p>
            </div>
          </div>
          {puedeCancelar ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCancelar(programada)}
            >
              <Undo2 data-icon="inline-start" aria-hidden />
              Cancelar programación
            </Button>
          ) : null}
        </div>
      ))}

      <HistorialVersiones versiones={celda.versiones} />

      <DialogoConfirmacion
        abierto={cancelar !== null}
        onAbiertoChange={(abierto) => !abierto && setCancelar(null)}
        titulo="¿Cancelar la tarifa programada?"
        descripcion={
          cancelar
            ? `La tarifa de ${formatearCOP(cancelar.valorBase)} no entrará en vigor el ${formatearFechaHora(cancelar.vigenteDesde)} y la vigencia anterior continúa.`
            : undefined
        }
        textoConfirmar="Cancelar programación"
        textoCancelar="Volver"
        destructivo
        onConfirmar={async () => {
          if (!cancelar) return false
          const resultado = await cancelarTarifaProgramada({
            tarifaId: cancelar.id,
          })
          if (resultado.ok) toast.success("Programación cancelada")
          return resultado
        }}
      />
    </div>
  )
}

function HistorialVersiones({
  versiones,
}: {
  versiones: CeldaElegida["versiones"]
}) {
  if (versiones.length === 0) return null
  return (
    <section aria-labelledby="historial-tarifa" className="flex flex-col gap-2">
      <h3
        id="historial-tarifa"
        className="text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase"
      >
        Versiones ({versiones.length})
      </h3>
      <ol className="flex flex-col divide-y rounded-xl border">
        {versiones.map((version, indice) => {
          const anterior = versiones[indice + 1]
          return (
            <li
              key={version.id}
              className="flex items-start justify-between gap-3 px-3.5 py-3"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold cifras">
                    {formatearCOP(version.valorBase)}
                  </span>
                  {anterior ? (
                    <span className="text-xs cifras text-muted-foreground">
                      {formatearDelta(
                        calcularDelta(version.valorBase, anterior.valorBase)
                      )}
                    </span>
                  ) : null}
                </div>
                <p className="text-xs cifras text-muted-foreground">
                  {textoVigencia(version.vigenteDesde, version.vigenteHasta)}
                  {version.creadaPor ? ` · ${version.creadaPor}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <InsigniaVigencia estado={version.estado} />
                {version.pendienteValidacion &&
                version.estado !== "FINALIZADA" ? (
                  <InsigniaPendiente compacta />
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function FormularioTarifa({ celda }: { celda: CeldaElegida }) {
  const { cerrar } = useHojaLateral()
  const ahora = new Date()
  const formulario = useForm({
    resolver: zodResolver(esquemaProgramarTarifa),
    defaultValues: valoresProgramarTarifa(
      celda.formato.id,
      celda.franja.id,
      inicioSugerido(celda.versiones, ahora)
    ),
    mode: "onTouched",
  })
  const { control } = formulario
  const ultima = inicioUltimaProgramada(celda.versiones, ahora)
  const vigente = celda.versiones.find((v) => v.estado === "VIGENTE") ?? null

  const [inicio, dia, hora, textoValor] = useWatch({
    control,
    name: ["inicio", "dia", "hora", "valor"],
  })
  const desde = inicioEstimado(inicio, dia, hora, ahora)
  const programable =
    desde !== null && inicioProgramable(desde, celda.versiones, ahora)
  const valor = textoANumero(String(textoValor ?? ""))

  const { enviar, pendiente, errorGeneral, sucio } = useEnvio({
    formulario,
    accion: programarTarifa,
    campos: CAMPOS,
    onExito: ({ desde: inicioReal }) => {
      toast.success("Tarifa programada", {
        description: `Entra en vigor el ${formatearFechaHora(inicioReal)}.`,
      })
      cerrar()
    },
  })

  return (
    <FormProvider {...formulario}>
      <FormularioHoja
        onEnviar={enviar}
        pendiente={pendiente}
        sucio={sucio}
        errorGeneral={errorGeneral}
        textoEnviar="Programar tarifa"
        iconoEnviar={CalendarPlus}
        envioDeshabilitado={desde !== null && !programable}
      >
        <ResumenCelda celda={celda} puedeCancelar />

        <section
          aria-labelledby="programar-tarifa"
          className="flex flex-col gap-5 border-t pt-5"
        >
          <div className="flex flex-col gap-1">
            <h3
              id="programar-tarifa"
              className="font-heading text-[0.9375rem] font-semibold"
            >
              Programar nueva tarifa
            </h3>
            <p className="text-sm text-muted-foreground">
              La vigente se cierra cuando empiece la nueva. Las asignaciones ya
              aceptadas conservan su precio.
            </p>
          </div>

          <CampoCifra
            nombre="valor"
            etiqueta="Nueva tarifa base"
            prefijo="$"
            placeholder={
              vigente ? numeroAEntrada(vigente.valorBase) : "450.000"
            }
            deshabilitado={pendiente}
            descripcion="En pesos, sin decimales. Es el valor antes del multiplicador de calidad y la comisión."
          />

          <Controller
            control={control}
            name="inicio"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel id="inicio-tarifa">Empieza</FieldLabel>
                <RadioGroup
                  aria-labelledby="inicio-tarifa"
                  value={field.value}
                  onValueChange={(valorInicio) => field.onChange(valorInicio)}
                  className="grid gap-2 sm:grid-cols-2"
                  disabled={pendiente}
                >
                  {INICIOS_TARIFA.map((opcion) => {
                    const fecha =
                      opcion === "fecha"
                        ? null
                        : inicioEstimado(opcion, "", "", ahora)
                    const permitido =
                      fecha === null ||
                      inicioProgramable(fecha, celda.versiones, ahora)
                    return (
                      <FieldLabel
                        key={opcion}
                        htmlFor={`inicio-${opcion}`}
                        className={cn(
                          opcion === "fecha" && "sm:col-span-2",
                          !permitido && "opacity-55"
                        )}
                      >
                        <Field orientation="horizontal">
                          <FieldContent>
                            <FieldTitle>
                              {opcion === "pronto"
                                ? "Lo antes posible"
                                : opcion === "fecha"
                                  ? "En una fecha y hora"
                                  : ETIQUETAS_PRESET_INICIO[opcion]}
                            </FieldTitle>
                            <FieldDescription className="text-xs cifras">
                              {fecha && opcion !== "pronto"
                                ? formatearFechaHora(fecha)
                                : DESCRIPCION_INICIO[opcion]}
                            </FieldDescription>
                          </FieldContent>
                          <RadioGroupItem
                            value={opcion}
                            id={`inicio-${opcion}`}
                            disabled={!permitido}
                          />
                        </Field>
                      </FieldLabel>
                    )
                  })}
                </RadioGroup>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          {inicio === "fecha" ? (
            <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
              <CampoFecha
                nombre="dia"
                etiqueta="Día"
                minimo={hoyBogota(ahora)}
                deshabilitado={pendiente}
              />
              <CampoHora
                nombre="hora"
                etiqueta="Hora"
                deshabilitado={pendiente}
              />
            </div>
          ) : null}

          {ultima ? (
            <p className="text-xs text-muted-foreground">
              Hay una tarifa programada para el {formatearFechaHora(ultima)}: la
              nueva debe empezar después (o cancela la programada).
            </p>
          ) : null}

          {desde && valor !== null && valor > 0 ? (
            <VistaPreviaCambio
              desde={desde}
              antes={vigente?.valorBase ?? null}
              despues={valor}
              programable={programable}
            />
          ) : null}
        </section>
      </FormularioHoja>
    </FormProvider>
  )
}

function VistaPreviaCambio({
  desde,
  antes,
  despues,
  programable,
}: {
  desde: Date
  antes: number | null
  despues: number
  programable: boolean
}) {
  if (!programable) {
    return (
      <p
        role="alert"
        className="rounded-lg bg-destructive/8 px-3 py-2.5 text-sm text-destructive"
      >
        Esa fecha no está disponible: debe ser futura y posterior a la última
        tarifa programada.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/6 p-4">
      <p className="text-xs cifras text-muted-foreground">
        Desde el {formatearFechaHora(desde)}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-base">
        {antes !== null ? (
          <>
            <span className="cifras text-muted-foreground line-through decoration-muted-foreground/40">
              {formatearCOP(antes)}
            </span>
            <ArrowRight aria-hidden className="size-4 text-muted-foreground" />
          </>
        ) : null}
        <span className="font-semibold cifras">{formatearCOP(despues)}</span>
        {antes !== null ? (
          <span className="text-sm cifras text-muted-foreground">
            {formatearDelta(calcularDelta(despues, antes))}
          </span>
        ) : null}
      </div>
    </div>
  )
}
