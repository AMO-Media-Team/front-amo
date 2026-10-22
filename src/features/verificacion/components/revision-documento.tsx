"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  FileCheck2,
  FileSearch,
  ShieldX,
  Video,
} from "lucide-react"
import Link from "next/link"
import { useId, useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import { VisorArchivoFirmado } from "@/components/archivos/visor-archivo-firmado"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { InsigniaEstado } from "@/features/operacion/components/distintivos"
import {
  ESTADOS_DOCUMENTO,
  TIPOS_DOCUMENTO_MEDIO,
} from "@/features/operacion/estados"
import { instanteDeDia } from "@/features/operacion/formato"
import { aplicarErroresServidor } from "@/features/usuarios/components/errores-formulario"
import { formatearFecha, formatearFechaHora } from "@/lib/format"

import {
  aprobarDocumento,
  firmarDocumento,
  rechazarDocumento,
} from "../actions"
import { rutaRevisionMedio } from "../colas"
import {
  enFrase,
  GUIA_DOCUMENTO,
  MOTIVOS_RECHAZO_DOCUMENTO,
} from "../presentacion"
import { esquemaAprobarDocumento, LIMITES_VERIFICACION } from "../schemas"
import type { DocumentoExpediente, MedioResumen } from "../tipos"
import { ATAJOS_VIGENCIA, sumarMeses } from "../vigencia"
import { DialogoMotivoVerificacion } from "./dialogo-motivo-verificacion"
import { CuerpoRevision, HojaRevision } from "./hoja-revision"

const CAMPOS = ["fechaVencimiento", "observaciones"] as const

function nombreDocumento(documento: DocumentoExpediente): string {
  return TIPOS_DOCUMENTO_MEDIO[documento.tipo]
}

/** El archivo, o la constancia de la videollamada si no lo hay. */
function ArchivoDocumento({
  documento,
  medio,
}: {
  documento: DocumentoExpediente
  medio: MedioResumen
}) {
  if (documento.metodo === "VIDEOLLAMADA") {
    return (
      <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed bg-muted/30 p-5 text-sm">
        <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
          <Video aria-hidden className="size-5" />
        </span>
        <p className="font-medium">Verificada por videollamada</p>
        <p className="text-pretty text-muted-foreground">
          No hay imagen: el equipo AMO dejó constancia de la videollamada.
        </p>
        {documento.observaciones ? (
          <p className="text-pretty">{documento.observaciones}</p>
        ) : null}
      </div>
    )
  }
  return (
    <VisorArchivoFirmado
      key={documento.id}
      firmar={() => firmarDocumento({ documentoId: documento.id })}
      nombre={nombreDocumento(documento)}
      tipo={documento.mime ?? undefined}
      descripcion={`${nombreDocumento(documento)} de ${medio.nombre}`}
    />
  )
}

function GuiaDocumento({ documento }: { documento: DocumentoExpediente }) {
  const idTitulo = useId()
  return (
    <section aria-labelledby={idTitulo} className="flex flex-col gap-2">
      <h3 id={idTitulo} className="text-sm font-semibold">
        Qué comprobar
      </h3>
      <ul className="flex flex-col gap-1.5 text-sm">
        {GUIA_DOCUMENTO[documento.tipo].map((punto) => (
          <li key={punto} className="flex items-start gap-2 text-pretty">
            <CircleCheck
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-primary"
            />
            {punto}
          </li>
        ))}
      </ul>
    </section>
  )
}

function DatosDocumento({ documento }: { documento: DocumentoExpediente }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
      <div className="flex flex-col gap-0.5">
        <dt className="text-xs text-muted-foreground">Estado</dt>
        <dd>
          <InsigniaEstado
            catalogo={ESTADOS_DOCUMENTO}
            estado={documento.estado}
          />
        </dd>
      </div>
      <div className="flex flex-col gap-0.5">
        <dt className="text-xs text-muted-foreground">Cargado</dt>
        <dd title={formatearFechaHora(documento.subidoAt)}>
          {formatearFecha(documento.subidoAt)}
        </dd>
      </div>
      {documento.venceAt ? (
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Vigente hasta</dt>
          <dd>{formatearFecha(instanteDeDia(documento.venceAt))}</dd>
        </div>
      ) : null}
      {documento.validadoAt ? (
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Revisado</dt>
          <dd title={formatearFechaHora(documento.validadoAt)}>
            {formatearFecha(documento.validadoAt)}
          </dd>
        </div>
      ) : null}
      {documento.observaciones && documento.metodo === "ARCHIVO" ? (
        <div className="col-span-2 flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Observaciones</dt>
          <dd className="text-pretty">{documento.observaciones}</dd>
        </div>
      ) : null}
    </dl>
  )
}

function useFormularioAprobacion(documento: DocumentoExpediente) {
  return useForm({
    resolver: zodResolver(esquemaAprobarDocumento),
    defaultValues: {
      documentoId: documento.id,
      fechaVencimiento: documento.venceAt ?? "",
      observaciones: "",
    },
    mode: "onTouched",
  })
}

type FormularioDeAprobacion = ReturnType<typeof useFormularioAprobacion>

/** Vigencia y observaciones con que se aprueba (formulario de la hoja). */
function FormularioAprobacion({
  id,
  formulario,
  hoy,
  deshabilitado,
  onEnviar,
}: {
  id: string
  formulario: FormularioDeAprobacion
  hoy: string
  deshabilitado: boolean
  onEnviar: () => void
}) {
  const { register, setValue, formState, handleSubmit } = formulario
  const errorGeneral = formState.errors.root?.servidor?.message

  function fijarVigencia(valor: string) {
    setValue("fechaVencimiento", valor, {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

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

      <Field
        data-invalid={formState.errors.fechaVencimiento ? true : undefined}
      >
        <FieldLabel htmlFor={`${id}-vigencia`}>
          Vigente hasta{" "}
          <span className="font-normal text-muted-foreground">(opcional)</span>
        </FieldLabel>
        <Input
          id={`${id}-vigencia`}
          type="date"
          min={hoy}
          disabled={deshabilitado}
          aria-invalid={formState.errors.fechaVencimiento ? true : undefined}
          aria-describedby={`${id}-vigencia-ayuda`}
          className="h-10 sm:h-8"
          {...register("fechaVencimiento")}
        />
        <div
          role="group"
          aria-label="Atajos de vigencia"
          className="flex flex-wrap gap-1.5"
        >
          {ATAJOS_VIGENCIA.map((atajo) => (
            <Button
              key={atajo.meses}
              type="button"
              variant="outline"
              size="sm"
              disabled={deshabilitado}
              onClick={() => fijarVigencia(sumarMeses(hoy, atajo.meses))}
            >
              {atajo.etiqueta}
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={deshabilitado}
            onClick={() => fijarVigencia("")}
          >
            No vence
          </Button>
        </div>
        <FieldDescription id={`${id}-vigencia-ayuda`}>
          Vacía si el documento no vence (como la cédula). Al terminar ese día
          vence y el medio recibe un aviso para renovarlo.
        </FieldDescription>
        <FieldError errors={[formState.errors.fechaVencimiento]} />
      </Field>

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
          {...register("observaciones")}
        />
        <FieldDescription>
          Las ve el medio junto al documento aprobado.
        </FieldDescription>
        <FieldError errors={[formState.errors.observaciones]} />
      </Field>
    </form>
  )
}

export interface HojaDocumentoProps {
  documento: DocumentoExpediente
  medio: MedioResumen
  /** `YYYY-MM-DD` de Bogotá (mínimo de la vigencia y base de los atajos). */
  hoy: string
  abierta: boolean
  onAbiertaChange: (abierta: boolean) => void
  /** Tras aprobar o rechazar (p. ej. para pasar al siguiente de la cola). */
  onDecidido?: () => void
  /** Desde la cola: enlace al expediente completo del medio. */
  conEnlaceExpediente?: boolean
}

/**
 * Revisión de un documento: el archivo (URL firmada como servicio, que queda
 * en la bitácora), qué comprobar y la decisión. Uno PENDIENTE se aprueba con
 * vigencia y observaciones o se rechaza con un motivo que el medio recibe;
 * los demás solo se consultan.
 */
export function HojaDocumento({
  documento,
  medio,
  hoy,
  abierta,
  onAbiertaChange,
  onDecidido,
  conEnlaceExpediente = false,
}: HojaDocumentoProps) {
  const idFormulario = useId()
  const formulario = useFormularioAprobacion(documento)
  const [pendiente, iniciar] = useTransition()
  const [rechazando, setRechazando] = useState(false)
  const porRevisar = documento.estado === "PENDIENTE"
  const nombre = nombreDocumento(documento)

  function terminar(mensaje: string) {
    toast.success(mensaje, { description: `${nombre} de ${medio.nombre}` })
    if (onDecidido) onDecidido()
    else onAbiertaChange(false)
  }

  function aprobar() {
    iniciar(async () => {
      const resultado = await aprobarDocumento(formulario.getValues())
      if (!resultado.ok) {
        aplicarErroresServidor(formulario.setError, resultado, CAMPOS)
        return
      }
      terminar("Documento aprobado")
    })
  }

  return (
    <>
      <HojaRevision
        abierta={abierta}
        onAbiertaChange={onAbiertaChange}
        bloqueada={pendiente}
        icono={porRevisar ? FileSearch : FileCheck2}
        titulo={porRevisar ? `Revisar ${enFrase(nombre)}` : nombre}
        descripcion={
          <>
            {medio.nombre} ·{" "}
            {documento.metodo === "VIDEOLLAMADA" ? "registrada" : "cargado"} el{" "}
            <time
              dateTime={documento.subidoAt}
              title={formatearFechaHora(documento.subidoAt)}
            >
              {formatearFecha(documento.subidoAt)}
            </time>
          </>
        }
        pie={
          porRevisar ? (
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
                disabled={pendiente}
              >
                {pendiente ? (
                  <Spinner aria-label="Aprobando" data-icon="inline-start" />
                ) : (
                  <CircleCheck data-icon="inline-start" aria-hidden />
                )}
                Aprobar
              </Button>
            </>
          ) : null
        }
      >
        <CuerpoRevision
          archivo={<ArchivoDocumento documento={documento} medio={medio} />}
        >
          <DatosDocumento documento={documento} />
          {porRevisar ? (
            <>
              <GuiaDocumento documento={documento} />
              <FormularioAprobacion
                id={idFormulario}
                formulario={formulario}
                hoy={hoy}
                deshabilitado={pendiente}
                onEnviar={aprobar}
              />
            </>
          ) : null}
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
        titulo={`¿Rechazar ${enFrase(nombre)}?`}
        descripcion={
          <>
            <strong>{medio.nombre}</strong> recibirá un aviso con el motivo para
            cargarlo de nuevo.
          </>
        }
        ayuda="El medio lo verá tal cual; queda en la bitácora."
        sugerencias={MOTIVOS_RECHAZO_DOCUMENTO}
        textoConfirmar="Rechazar documento"
        onConfirmar={async (motivo) => {
          const resultado = await rechazarDocumento({
            documentoId: documento.id,
            motivo,
          })
          if (resultado.ok) terminar("Documento rechazado")
          return resultado
        }}
      />
    </>
  )
}
