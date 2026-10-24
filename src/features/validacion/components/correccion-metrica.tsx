"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { CircleAlert, PencilLine, RefreshCw, Save } from "lucide-react"
import {
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react"
import {
  type FieldErrors,
  type FieldPath,
  FormProvider,
  type Resolver,
  useForm,
  useWatch,
} from "react-hook-form"
import { toast } from "sonner"

import { Esqueleto } from "@/components/feedback/esqueletos"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { CampoFecha } from "@/features/configuracion/components/campos"
import { textoANumero } from "@/features/configuracion/numeros"
import {
  CAMPOS,
  camposMetricas,
  type DefinicionCampo,
} from "@/features/ejecucion/campos-metricas"
import {
  CampoCifraMetrica,
  CampoHoraExacta,
} from "@/features/ejecucion/components/campos-ejecucion"
import { useFocoErrores } from "@/features/ejecucion/components/use-foco-errores"
import { tituloCorte } from "@/features/ejecucion/cortes"
import { diaDe } from "@/features/ejecucion/metricas"
import { conReglasMetricas } from "@/features/ejecucion/schemas"
import { formatearRangoCompacto } from "@/features/operacion/formato"
import { aplicarErroresServidor } from "@/features/usuarios/components/errores-formulario"
import { LONGITUD_MAXIMA_MOTIVO } from "@/features/usuarios/schemas"
import { CuerpoRevision } from "@/features/verificacion/components/hoja-revision"
import { formatearNumero } from "@/lib/format"

import { corregirMetrica, prepararCorreccionMetrica } from "../actions"
import { reglasCorreccion, valoresInicialesCorreccion } from "../correccion"
import { esquemaCorreccion, type ValoresCorreccion } from "../schemas"
import type { MetricaParaCorregir } from "../tipos"
import { CapturaRevision, VisorCaptura } from "./capturas"
import { CabeceraHoja, CuerpoHoja, MarcoHoja, PieHoja } from "./hoja-validacion"

const SUFIJOS: Readonly<Record<DefinicionCampo["tipo"], string | undefined>> = {
  entero: undefined,
  segundos: "s",
  porcentaje: "%",
}

const CAMPOS_FORMULARIO = [
  "dia",
  "hora",
  "interacciones",
  ...CAMPOS,
  "motivo",
] as const

type Carga =
  | { tipo: "cargando" }
  | { tipo: "error"; mensaje: string }
  | { tipo: "lista"; metrica: MetricaParaCorregir }

/** Suma de interacciones en vivo, con el error de coherencia si lo hay. */
function SumaInteracciones({
  idError,
  definiciones,
  textos,
  error,
}: {
  idError: string
  definiciones: readonly DefinicionCampo[]
  textos: readonly string[]
  error: { message?: string } | undefined
}) {
  const suma = definiciones
    .filter((definicion) => definicion.interaccion)
    .reduce((total, definicion) => {
      const valor = textoANumero(textos[CAMPOS.indexOf(definicion.clave)] ?? "")
      return total + (valor !== null && valor > 0 ? Math.trunc(valor) : 0)
    }, 0)
  return (
    <div
      data-invalid={error ? true : undefined}
      className="flex flex-col gap-1 rounded-xl border bg-muted/30 p-3 text-sm data-[invalid=true]:border-destructive/50"
    >
      <p className="flex items-baseline justify-between gap-3">
        <span className="font-medium">Interacciones</span>
        <span className="text-base font-semibold cifras">
          {formatearNumero(suma)}
        </span>
      </p>
      <FieldError id={idError} errors={[error]} />
    </div>
  )
}

function FormularioCorreccion({
  metrica,
  idFormulario,
  pendiente,
  iniciar,
  onCorregida,
}: {
  metrica: MetricaParaCorregir
  idFormulario: string
  pendiente: boolean
  iniciar: (accion: () => Promise<void>) => void
  onCorregida: () => void
}) {
  const formularioRef = useRef<HTMLFormElement>(null)
  const mostrarErrores = useFocoErrores(pendiente, formularioRef)
  const idErrorInteracciones = useId()
  const idMotivo = useId()
  const definiciones = useMemo(
    () => camposMetricas(metrica.plataforma, metrica.formatoClave),
    [metrica.plataforma, metrica.formatoClave]
  )
  // Las reglas leen la hora al validar: el formulario puede quedar abierto.
  const resolver = useMemo<Resolver<ValoresCorreccion>>(
    () => (valores, contexto, opciones) =>
      zodResolver(
        conReglasMetricas(
          esquemaCorreccion,
          reglasCorreccion(metrica, new Date())
        )
      )(valores, contexto, opciones),
    [metrica]
  )
  const formulario = useForm<ValoresCorreccion>({
    resolver,
    defaultValues: valoresInicialesCorreccion(metrica),
    mode: "onTouched",
  })
  const { formState, control, register, trigger, getFieldState } = formulario
  const errores = formState.errors as FieldErrors
  const errorGeneral = formState.errors.root?.servidor?.message

  // Las reglas cruzan campos (impresiones ≥ alcance, interacciones, fecha):
  // al cambiar uno se revalidan los que ya muestran un error.
  const textos = useWatch({ control, name: CAMPOS })
  const fecha = useWatch({ control, name: ["dia", "hora"] })
  const huella = [...textos, ...fecha].join("|")
  useEffect(() => {
    const conError = CAMPOS_FORMULARIO.filter(
      (campo) => getFieldState(campo as FieldPath<ValoresCorreccion>).invalid
    )
    if (conError.length > 0) {
      void trigger(conError as FieldPath<ValoresCorreccion>[])
    }
  }, [huella, getFieldState, trigger])

  function enviar(evento: FormEvent<HTMLFormElement>) {
    void formulario.handleSubmit(
      () => {
        iniciar(async () => {
          const resultado = await corregirMetrica(formulario.getValues())
          if (!resultado.ok) {
            aplicarErroresServidor(
              formulario.setError,
              resultado,
              CAMPOS_FORMULARIO as unknown as FieldPath<ValoresCorreccion>[]
            )
            mostrarErrores()
            return
          }
          toast.success("Métrica corregida", {
            description: `${tituloCorte(metrica.corte)}: el cambio y tu motivo quedaron en la bitácora.`,
          })
          onCorregida()
        })
      },
      () => mostrarErrores()
    )(evento)
  }

  return (
    <FormProvider {...formulario}>
      <form
        ref={formularioRef}
        id={idFormulario}
        noValidate
        onSubmit={enviar}
        aria-busy={pendiente || undefined}
        className="flex flex-col gap-5"
      >
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Cifras del panel</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {definiciones.map((definicion) => (
              <CampoCifraMetrica
                key={definicion.clave}
                nombre={definicion.clave}
                etiqueta={definicion.etiqueta}
                descripcion={definicion.ayuda}
                opcional={!definicion.obligatorio}
                decimal={definicion.tipo !== "entero"}
                sufijo={SUFIJOS[definicion.tipo]}
                placeholder={definicion.tipo === "entero" ? "0" : "0,0"}
                deshabilitado={pendiente}
                describidaPor={
                  definicion.interaccion && errores.interacciones
                    ? idErrorInteracciones
                    : undefined
                }
              />
            ))}
          </div>
          <SumaInteracciones
            idError={idErrorInteracciones}
            definiciones={definiciones}
            textos={textos}
            error={errores.interacciones}
          />
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Fecha de la captura</h3>
          {metrica.periodo ? (
            <p className="text-sm text-muted-foreground">
              Periodo reportado:{" "}
              {formatearRangoCompacto(
                metrica.periodo.desde,
                metrica.periodo.hasta
              )}{" "}
              (no se corrige aquí).
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoFecha
              nombre="dia"
              etiqueta="Día"
              minimo={diaDe(metrica.fechaPublicacion)}
              deshabilitado={pendiente}
            />
            <CampoHoraExacta
              nombre="hora"
              etiqueta="Hora"
              descripcion="Hora de Colombia."
              deshabilitado={pendiente}
            />
          </div>
        </section>

        <Field data-invalid={formState.errors.motivo ? true : undefined}>
          <FieldLabel htmlFor={idMotivo}>Motivo de la corrección</FieldLabel>
          <Textarea
            id={idMotivo}
            rows={3}
            maxLength={LONGITUD_MAXIMA_MOTIVO}
            disabled={pendiente}
            placeholder="Ej.: el medio digitó 12.500 de alcance y la captura muestra 1.250…"
            aria-invalid={formState.errors.motivo ? true : undefined}
            aria-describedby={`${idMotivo}-ayuda${
              formState.errors.motivo ? ` ${idMotivo}-error` : ""
            }`}
            {...register("motivo")}
          />
          <FieldDescription id={`${idMotivo}-ayuda`}>
            Obligatorio: queda en la bitácora con tu nombre; el medio y el
            anunciante no lo ven.
          </FieldDescription>
          <FieldError
            id={`${idMotivo}-error`}
            errors={[formState.errors.motivo]}
          />
        </Field>

        {errorGeneral ? (
          <Alert variant="destructive" role="alert" data-error-general>
            <CircleAlert aria-hidden />
            <AlertDescription>{errorGeneral}</AlertDescription>
          </Alert>
        ) : null}
      </form>
    </FormProvider>
  )
}

function EsqueletoCorreccion() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">Cargando la métrica…</span>
      <div aria-hidden className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3, 4, 5].map((indice) => (
          <Esqueleto key={indice} className="h-16 rounded-lg" />
        ))}
      </div>
      <Esqueleto aria-hidden className="h-24 rounded-lg" />
    </div>
  )
}

/**
 * Corrección de una métrica aprobada (ADM-008 c2), solo con
 * `metricas.editar_validadas`: las cifras y la fecha de la captura con las
 * mismas reglas de coherencia que la carga del medio, y un motivo obligatorio
 * que queda en la bitácora. Se abre desde la ficha de la asignación, con la
 * captura al lado para comparar.
 */
export function HojaCorreccion({
  metricaId,
  corteNombre,
  captura,
  abierta,
  onAbiertaChange,
  focoAlCerrar,
}: {
  metricaId: string
  /** «24 horas», para el título. */
  corteNombre: string
  /** URL firmada de la captura del corte (o `null`) y si aún se firma. */
  captura: { url: string | null; cargando: boolean }
  abierta: boolean
  onAbiertaChange: (abierta: boolean) => void
  focoAlCerrar?: () => HTMLElement | null
}) {
  const idFormulario = useId()
  const [pendiente, iniciarTransicion] = useTransition()
  const [carga, setCarga] = useState<Carga>({ tipo: "cargando" })
  const [, iniciarLectura] = useTransition()

  const [ampliada, setAmpliada] = useState(false)

  const leer = useCallback(
    () =>
      iniciarLectura(async () => {
        setCarga({ tipo: "cargando" })
        const resultado = await prepararCorreccionMetrica({ metricaId })
        setCarga(
          resultado.ok
            ? { tipo: "lista", metrica: resultado.datos }
            : { tipo: "error", mensaje: resultado.error }
        )
      }),
    [metricaId]
  )

  useEffect(() => {
    if (abierta) leer()
  }, [abierta, leer])

  return (
    <MarcoHoja
      abierta={abierta}
      onAbiertaChange={onAbiertaChange}
      bloqueada={pendiente}
      focoAlCerrar={focoAlCerrar}
    >
      <CabeceraHoja
        icono={PencilLine}
        titulo={`Corregir las métricas de ${corteNombre}`}
        descripcion="Solo errores comprobados con la captura del panel: el cambio y tu motivo quedan en la bitácora."
        bloqueada={pendiente}
        onCerrar={() => onAbiertaChange(false)}
      />
      <CuerpoHoja>
        <CuerpoRevision
          archivo={
            <CapturaRevision
              url={captura.url}
              cargando={captura.cargando}
              etiqueta={`Captura del panel de las métricas de ${corteNombre}`}
              onAmpliar={() => setAmpliada(true)}
            />
          }
        >
          {carga.tipo === "cargando" ? <EsqueletoCorreccion /> : null}
          {carga.tipo === "error" ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden />
              <AlertTitle>No pudimos abrir la corrección</AlertTitle>
              <AlertDescription>
                <p>{carga.mensaje}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={leer}
                  className="mt-2 w-fit"
                >
                  <RefreshCw data-icon="inline-start" aria-hidden />
                  Reintentar
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {carga.tipo === "lista" ? (
            <FormularioCorreccion
              metrica={carga.metrica}
              idFormulario={idFormulario}
              pendiente={pendiente}
              iniciar={(accion) => iniciarTransicion(accion)}
              onCorregida={() => onAbiertaChange(false)}
            />
          ) : null}
        </CuerpoRevision>
      </CuerpoHoja>
      <PieHoja>
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={pendiente}
          onClick={() => onAbiertaChange(false)}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          form={idFormulario}
          size="lg"
          disabled={pendiente || carga.tipo !== "lista"}
        >
          {pendiente ? (
            <Spinner aria-label="Guardando" data-icon="inline-start" />
          ) : (
            <Save data-icon="inline-start" aria-hidden />
          )}
          Guardar la corrección
        </Button>
      </PieHoja>
      <VisorCaptura
        abierta={
          ampliada
            ? {
                origen: "metricas",
                id: metricaId,
                titulo: `Captura de las métricas de ${corteNombre}`,
                descripcion: "Compárala con las cifras que corriges.",
              }
            : null
        }
        url={captura.url}
        onCerrar={() => setAmpliada(false)}
      />
    </MarcoHoja>
  )
}
