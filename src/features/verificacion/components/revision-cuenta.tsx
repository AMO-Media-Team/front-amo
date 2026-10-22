"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  ExternalLink,
  ScanSearch,
  ShieldX,
  TimerOff,
  TriangleAlert,
  UserRoundSearch,
} from "lucide-react"
import Link from "next/link"
import { useId, useState, useTransition } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { VisorArchivoFirmado } from "@/components/archivos/visor-archivo-firmado"
import { EnlaceBotonExterno } from "@/components/layout/enlace-boton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { MarcaPlataforma } from "@/features/operacion/components/distintivos"
import { METODOS_VERIFICACION, PLATAFORMAS } from "@/features/operacion/estados"
import { formatearHandle } from "@/features/operacion/formato"
import { aplicarErroresServidor } from "@/features/usuarios/components/errores-formulario"
import {
  formatearFecha,
  formatearFechaHora,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  aprobarVerificacionCuenta,
  comprobarCodigoHistoria,
  firmarCaptura,
  rechazarVerificacionCuenta,
} from "../actions"
import { momentoCaptura } from "../codigo"
import { rutaRevisionMedio } from "../colas"
import { enFrase, MOTIVOS_RECHAZO_CUENTA } from "../presentacion"
import { esquemaAprobarCuenta, LIMITES_VERIFICACION } from "../schemas"
import {
  franjaPara,
  parsearSeguidores,
  type RangoFranja,
  variacionSeguidores,
} from "../seguidores"
import type { VerificacionEnCola } from "../tipos"
import { DialogoMotivoVerificacion } from "./dialogo-motivo-verificacion"
import { CuerpoRevision, HojaRevision } from "./hoja-revision"

const CAMPOS = ["seguidoresVerificados", "observaciones"] as const

function nombreCuenta(verificacion: VerificacionEnCola): string {
  return `${PLATAFORMAS[verificacion.cuenta.plataforma]} ${formatearHandle(verificacion.cuenta.handle)}`
}

function textoMargen(minutos: number): string {
  const absoluto = Math.abs(minutos)
  if (absoluto < 1) return "menos de un minuto"
  if (absoluto < 60) return `${absoluto} min`
  const horas = Math.floor(absoluto / 60)
  const resto = absoluto % 60
  return resto ? `${horas} h ${resto} min` : `${horas} h`
}

/** ¿La captura llegó antes de que venciera el código? (la BD lo exige). */
function AvisoCodigo({ verificacion }: { verificacion: VerificacionEnCola }) {
  const momento = momentoCaptura(
    verificacion.actualizadaAt,
    verificacion.codigoExpiraAt
  )
  if (!momento) return null
  if (momento.aTiempo) {
    return (
      <p className="flex items-start gap-2 text-sm text-pretty text-success">
        <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
        Captura cargada {textoMargen(momento.margenMinutos)} antes de que
        venciera el código.
      </p>
    )
  }
  return (
    <Alert variant="destructive">
      <TimerOff aria-hidden />
      <AlertTitle>La captura llegó tarde</AlertTitle>
      <AlertDescription>
        Se cargó {textoMargen(momento.margenMinutos)} después de que venció el
        código, así que no se puede aprobar. Recházala para que el medio pida un
        código nuevo.
      </AlertDescription>
    </Alert>
  )
}

type Comprobacion =
  | { tipo: "inicial" }
  | { tipo: "coincide"; codigo: string }
  | { tipo: "no_coincide"; codigo: string }
  | { tipo: "error"; mensaje: string }

/**
 * El código temporal solo existe como huella: quien revisa escribe el que ve
 * en la historia y el servidor compara. No forma parte de la aprobación.
 */
function ComprobarCodigo({ verificacionId }: { verificacionId: string }) {
  const id = useId()
  const [codigo, setCodigo] = useState("")
  const [estado, setEstado] = useState<Comprobacion>({ tipo: "inicial" })
  const [comprobando, iniciar] = useTransition()

  function comprobar() {
    const escrito = codigo.trim()
    if (!escrito) {
      setEstado({
        tipo: "error",
        mensaje: "Escribe el código que ves en la captura.",
      })
      return
    }
    iniciar(async () => {
      const resultado = await comprobarCodigoHistoria({
        verificacionId,
        codigo: escrito,
      })
      if (!resultado.ok) {
        setEstado({
          tipo: "error",
          mensaje: resultado.erroresCampo?.codigo?.[0] ?? resultado.error,
        })
        return
      }
      setEstado(
        resultado.datos.coincide
          ? { tipo: "coincide", codigo: escrito }
          : { tipo: "no_coincide", codigo: escrito }
      )
    })
  }

  return (
    <Field data-invalid={estado.tipo === "error" ? true : undefined}>
      <FieldLabel htmlFor={`${id}-codigo`}>Código en la historia</FieldLabel>
      <div className="flex gap-2">
        <Input
          id={`${id}-codigo`}
          value={codigo}
          onChange={(evento) => {
            setCodigo(evento.target.value)
            setEstado({ tipo: "inicial" })
          }}
          onKeyDown={(evento) => {
            if (evento.key === "Enter") {
              evento.preventDefault()
              comprobar()
            }
          }}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={16}
          placeholder="Ej.: K7P4XQ"
          aria-invalid={estado.tipo === "error" ? true : undefined}
          aria-describedby={`${id}-resultado`}
          className="h-10 font-mono tracking-widest uppercase sm:h-8"
        />
        <Button
          type="button"
          variant="outline"
          className="h-10 shrink-0 sm:h-8"
          disabled={comprobando}
          onClick={comprobar}
        >
          {comprobando ? (
            <Spinner aria-label="Comprobando" data-icon="inline-start" />
          ) : null}
          Comprobar
        </Button>
      </div>
      <div id={`${id}-resultado`} aria-live="polite">
        {estado.tipo === "inicial" ? (
          <FieldDescription>
            Escribe el que aparece en la captura: lo comparamos con el que
            generó la plataforma, que nunca se guardó en claro.
          </FieldDescription>
        ) : null}
        {estado.tipo === "coincide" ? (
          <p className="flex items-center gap-2 text-sm font-medium text-success">
            <CircleCheck aria-hidden className="size-4" />«
            {estado.codigo.toLocaleUpperCase("es-CO")}» coincide con el código
            generado.
          </p>
        ) : null}
        {estado.tipo === "no_coincide" ? (
          <p className="flex items-start gap-2 text-sm font-medium text-destructive">
            <CircleX aria-hidden className="mt-0.5 size-4 shrink-0" />«
            {estado.codigo.toLocaleUpperCase("es-CO")}» no es el código
            generado. Revisa cada carácter; si no coincide, rechaza la
            verificación.
          </p>
        ) : null}
        {estado.tipo === "error" ? (
          <FieldError>{estado.mensaje}</FieldError>
        ) : null}
      </div>
    </Field>
  )
}

/** Variación frente a la última cifra aprobada y franja resultante. */
function EfectoSeguidores({
  seguidores,
  anteriores,
  franjas,
}: {
  seguidores: number | null
  anteriores: number | null
  franjas: readonly RangoFranja[]
}) {
  if (seguidores === null) return null
  const variacion = variacionSeguidores(seguidores, anteriores)
  const franja = franjaPara(seguidores, franjas)
  return (
    <div aria-live="polite" className="flex flex-col gap-2 text-sm">
      {franja ? (
        <p className="text-pretty">
          Queda en la franja <strong>{franja.nombre}</strong> (
          {formatearNumero(franja.minimo)}
          {franja.maximo === null
            ? " o más"
            : `–${formatearNumero(franja.maximo)}`}{" "}
          seguidores).
        </p>
      ) : (
        <p className="flex items-start gap-2 text-pretty text-warning">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          No alcanza la franja mínima: la cuenta quedará verificada pero no
          recibirá ofertas.
        </p>
      )}
      {variacion.fraccion !== null && anteriores !== null ? (
        <p
          className={cn(
            "text-pretty",
            variacion.salto ? "text-warning" : "text-muted-foreground"
          )}
        >
          {variacion.salto ? (
            <TriangleAlert
              aria-hidden
              className="mr-1.5 inline size-4 align-[-3px]"
            />
          ) : null}
          {variacion.fraccion >= 0 ? "Sube" : "Baja"}{" "}
          {formatearPorcentaje(Math.abs(variacion.fraccion), 0)} frente a la
          verificación anterior ({formatearNumero(anteriores)}).
          {variacion.salto
            ? " Es un cambio brusco: confirma que no sean seguidores comprados."
            : ""}
        </p>
      ) : null}
    </div>
  )
}

function DatosCuenta({ verificacion }: { verificacion: VerificacionEnCola }) {
  const { cuenta } = verificacion
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <MarcaPlataforma plataforma={cuenta.plataforma} />
          <span className="truncate font-medium">
            {formatearHandle(cuenta.handle)}
          </span>
        </span>
        <EnlaceBotonExterno
          href={cuenta.url}
          target="_blank"
          rel="noopener noreferrer"
          variant="outline"
          size="sm"
        >
          <ExternalLink data-icon="inline-start" aria-hidden />
          Abrir perfil
          <span className="sr-only">
            {" "}
            de {PLATAFORMAS[cuenta.plataforma]} (abre en una pestaña nueva)
          </span>
        </EnlaceBotonExterno>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Método</dt>
          <dd>{METODOS_VERIFICACION[verificacion.metodo]}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Reportados</dt>
          <dd className="cifras">
            {formatearNumero(verificacion.seguidoresReportados)}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Verificados antes</dt>
          <dd className="cifras">
            {cuenta.seguidoresVerificados === null
              ? "Nunca"
              : formatearNumero(cuenta.seguidoresVerificados)}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Solicitada</dt>
          <dd title={formatearFechaHora(verificacion.creadaAt)}>
            {formatearFecha(verificacion.creadaAt)}
          </dd>
        </div>
      </dl>
    </div>
  )
}

function useFormularioCuenta(verificacion: VerificacionEnCola) {
  return useForm({
    resolver: zodResolver(esquemaAprobarCuenta),
    defaultValues: {
      verificacionId: verificacion.id,
      seguidoresVerificados: verificacion.seguidoresReportados,
      observaciones: "",
    },
    mode: "onTouched",
  })
}

type FormularioDeCuenta = ReturnType<typeof useFormularioCuenta>

function FormularioCuenta({
  id,
  formulario,
  verificacion,
  franjas,
  deshabilitado,
  onEnviar,
}: {
  id: string
  formulario: FormularioDeCuenta
  verificacion: VerificacionEnCola
  franjas: readonly RangoFranja[]
  deshabilitado: boolean
  onEnviar: () => void
}) {
  const { control, register, formState, handleSubmit } = formulario
  const [texto, setTexto] = useState(
    formatearNumero(verificacion.seguidoresReportados)
  )
  const seguidores = useWatch({ control, name: "seguidoresVerificados" })
  const errorGeneral = formState.errors.root?.servidor?.message

  return (
    <form
      id={id}
      noValidate
      onSubmit={handleSubmit(onEnviar)}
      className="flex flex-col gap-5"
    >
      {errorGeneral ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertDescription>{errorGeneral}</AlertDescription>
        </Alert>
      ) : null}
      <Controller
        control={control}
        name="seguidoresVerificados"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid ? true : undefined}>
            <FieldLabel htmlFor={`${id}-seguidores`}>
              Seguidores verificados
            </FieldLabel>
            <Input
              id={`${id}-seguidores`}
              inputMode="numeric"
              autoComplete="off"
              value={texto}
              disabled={deshabilitado}
              onChange={(evento) => {
                setTexto(evento.target.value)
                field.onChange(
                  parsearSeguidores(evento.target.value) ?? Number.NaN
                )
              }}
              onBlur={() => {
                if (Number.isFinite(field.value)) {
                  setTexto(formatearNumero(field.value))
                }
                field.onBlur()
              }}
              aria-invalid={fieldState.invalid ? true : undefined}
              aria-describedby={`${id}-seguidores-ayuda`}
              className="h-10 cifras sm:h-8"
            />
            <FieldDescription id={`${id}-seguidores-ayuda`}>
              La cifra que ves en la captura; define la franja y el precio de la
              cuenta.
            </FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <EfectoSeguidores
        seguidores={Number.isFinite(seguidores) ? seguidores : null}
        anteriores={verificacion.cuenta.seguidoresVerificados}
        franjas={franjas}
      />
      <Field data-invalid={formState.errors.observaciones ? true : undefined}>
        <FieldLabel htmlFor={`${id}-observaciones`}>
          Observaciones{" "}
          <span className="font-normal text-muted-foreground">(opcional)</span>
        </FieldLabel>
        <Textarea
          id={`${id}-observaciones`}
          rows={2}
          maxLength={LIMITES_VERIFICACION.observacionesMax}
          disabled={deshabilitado}
          aria-invalid={formState.errors.observaciones ? true : undefined}
          aria-describedby={`${id}-observaciones-ayuda`}
          {...register("observaciones")}
        />
        <FieldDescription id={`${id}-observaciones-ayuda`}>
          Las ve el medio en el historial de la cuenta.
        </FieldDescription>
        <FieldError errors={[formState.errors.observaciones]} />
      </Field>
    </form>
  )
}

export interface HojaCuentaProps {
  verificacion: VerificacionEnCola
  franjas: readonly RangoFranja[]
  abierta: boolean
  onAbiertaChange: (abierta: boolean) => void
  onDecidido?: () => void
  conEnlaceExpediente?: boolean
}

/**
 * Revisión de la verificación de una cuenta social (MED-005/006): la captura
 * (firmada como servicio y registrada en la bitácora), el código temporal si
 * lo hay, y la decisión. Aprobar fija los seguidores verificados y con ellos
 * la franja; rechazar conserva la verificación anterior si estaba vigente.
 */
export function HojaCuenta({
  verificacion,
  franjas,
  abierta,
  onAbiertaChange,
  onDecidido,
  conEnlaceExpediente = false,
}: HojaCuentaProps) {
  const idFormulario = useId()
  const formulario = useFormularioCuenta(verificacion)
  const [pendiente, iniciar] = useTransition()
  const [rechazando, setRechazando] = useState(false)
  const nombre = nombreCuenta(verificacion)
  const { medio } = verificacion
  const momento = momentoCaptura(
    verificacion.actualizadaAt,
    verificacion.codigoExpiraAt
  )
  const capturaTardia = momento !== null && !momento.aTiempo
  // La BD exige la captura (y a tiempo) para aprobar; rechazar siempre se puede.
  const noAprobable = capturaTardia || !verificacion.mimeCaptura

  function terminar(mensaje: string) {
    toast.success(mensaje, { description: `${nombre} · ${medio.nombre}` })
    if (onDecidido) onDecidido()
    else onAbiertaChange(false)
  }

  function aprobar() {
    iniciar(async () => {
      const resultado = await aprobarVerificacionCuenta(formulario.getValues())
      if (!resultado.ok) {
        aplicarErroresServidor(formulario.setError, resultado, CAMPOS)
        return
      }
      terminar("Cuenta verificada")
    })
  }

  return (
    <>
      <HojaRevision
        abierta={abierta}
        onAbiertaChange={onAbiertaChange}
        bloqueada={pendiente}
        icono={UserRoundSearch}
        titulo={`Verificar ${nombre}`}
        descripcion={`${medio.nombre} · ${enFrase(METODOS_VERIFICACION[verificacion.metodo])}`}
        pie={
          <>
            <Button
              type="button"
              variant="destructive"
              size="lg"
              disabled={pendiente}
              onClick={() => setRechazando(true)}
            >
              <ShieldX data-icon="inline-start" aria-hidden />
              Rechazar
            </Button>
            <Button
              type="submit"
              form={idFormulario}
              size="lg"
              disabled={pendiente || noAprobable}
            >
              {pendiente ? (
                <Spinner aria-label="Aprobando" data-icon="inline-start" />
              ) : (
                <CircleCheck data-icon="inline-start" aria-hidden />
              )}
              Aprobar
            </Button>
          </>
        }
      >
        <CuerpoRevision
          archivo={
            verificacion.mimeCaptura ? (
              <VisorArchivoFirmado
                key={verificacion.id}
                firmar={() =>
                  firmarCaptura({ verificacionId: verificacion.id })
                }
                nombre={`Captura de ${nombre}`}
                tipo={verificacion.mimeCaptura}
                descripcion={`Captura de la cuenta ${nombre} de ${medio.nombre}`}
              />
            ) : (
              <p className="flex items-center gap-2 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                <ScanSearch aria-hidden className="size-5" />
                El medio aún no carga la captura.
              </p>
            )
          }
        >
          <DatosCuenta verificacion={verificacion} />
          {verificacion.metodo === "CODIGO_HISTORIA" ? (
            <section className="flex flex-col gap-3">
              <AvisoCodigo verificacion={verificacion} />
              <ComprobarCodigo verificacionId={verificacion.id} />
            </section>
          ) : null}
          <FormularioCuenta
            id={idFormulario}
            formulario={formulario}
            verificacion={verificacion}
            franjas={franjas}
            deshabilitado={pendiente || noAprobable}
            onEnviar={aprobar}
          />
          {conEnlaceExpediente ? (
            <Link
              href={rutaRevisionMedio(medio.id)}
              className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:underline"
            >
              Ver el expediente de {medio.nombre}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          ) : null}
        </CuerpoRevision>
      </HojaRevision>

      <DialogoMotivoVerificacion
        abierto={rechazando}
        onAbiertoChange={setRechazando}
        destructivo
        titulo={`¿Rechazar la verificación de ${nombre}?`}
        descripcion={
          <>
            <strong>{medio.nombre}</strong> recibirá un aviso con el motivo. Si
            la cuenta tenía una verificación vigente, la conserva.
          </>
        }
        ayuda="El medio lo verá tal cual; queda en la bitácora."
        sugerencias={MOTIVOS_RECHAZO_CUENTA}
        textoConfirmar="Rechazar verificación"
        onConfirmar={async (motivo) => {
          const resultado = await rechazarVerificacionCuenta({
            verificacionId: verificacion.id,
            motivo,
          })
          if (resultado.ok) terminar("Verificación rechazada")
          return resultado
        }}
      />
    </>
  )
}
