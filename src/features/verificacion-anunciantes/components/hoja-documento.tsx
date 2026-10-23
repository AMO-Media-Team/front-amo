"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  CircleAlert,
  CircleCheck,
  FileCheck2,
  FileSearch,
  ShieldX,
} from "lucide-react"
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
import { ESTADOS_DOCUMENTO } from "@/features/operacion/estados"
import { instanteDeDia } from "@/features/operacion/formato"
import { DialogoMotivo } from "@/features/usuarios/components/dialogo-motivo"
import { aplicarErroresServidor } from "@/features/usuarios/components/errores-formulario"
import {
  CuerpoRevision,
  HojaRevision,
} from "@/features/verificacion/components/hoja-revision"
import { ATAJOS_VIGENCIA, sumarMeses } from "@/features/verificacion/vigencia"
import { formatearFecha, formatearFechaHora } from "@/lib/format"

import {
  aprobarDocumentoAnunciante,
  firmarDocumentoAnunciante,
  rechazarDocumentoAnunciante,
} from "../actions"
import {
  type DatosComparables,
  enFraseDocumento,
  guiaDocumento,
  MOTIVOS_RECHAZO_DOCUMENTO,
  PLACEHOLDER_MOTIVO,
  tituloDocumento,
} from "../presentacion"
import {
  esquemaAprobarDocumentoAnunciante,
  LIMITES_VERIFICACION_ANUNCIANTE,
} from "../schemas"
import type { DocumentoExpediente } from "../tipos"

const CAMPOS = ["fechaVencimiento", "observaciones"] as const

export interface EmpresaRevisada extends DatosComparables {
  nombreComercial: string
}

function GuiaDocumento({
  documento,
  empresa,
}: {
  documento: DocumentoExpediente
  empresa: EmpresaRevisada
}) {
  const idTitulo = useId()
  return (
    <section aria-labelledby={idTitulo} className="flex flex-col gap-2">
      <h3 id={idTitulo} className="text-sm font-semibold">
        Qué comprobar
      </h3>
      <ul className="flex flex-col gap-1.5 text-sm">
        {guiaDocumento(documento.tipo, empresa).map((punto) => (
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
      {documento.observaciones ? (
        <div className="col-span-2 flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">
            {documento.estado === "RECHAZADO" ? "Motivo" : "Observaciones"}
          </dt>
          <dd className="text-pretty">{documento.observaciones}</dd>
        </div>
      ) : null}
    </dl>
  )
}

function useFormularioAprobacion(documento: DocumentoExpediente) {
  return useForm({
    resolver: zodResolver(esquemaAprobarDocumentoAnunciante),
    defaultValues: {
      documentoId: documento.id,
      fechaVencimiento: documento.venceAt ?? "",
      observaciones: "",
    },
    mode: "onTouched",
  })
}

type FormularioDeAprobacion = ReturnType<typeof useFormularioAprobacion>

/** Ayuda y, si lo hay, el error del campo (`{base}-ayuda`, `{base}-error`). */
function describir(base: string, conError: boolean): string {
  return conError ? `${base}-ayuda ${base}-error` : `${base}-ayuda`
}

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
  const errorVigencia = formState.errors.fechaVencimiento
  const errorObservaciones = formState.errors.observaciones

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

      <Field data-invalid={errorVigencia ? true : undefined}>
        <FieldLabel htmlFor={`${id}-vigencia`}>
          Vigente hasta{" "}
          <span className="font-normal text-muted-foreground">(opcional)</span>
        </FieldLabel>
        <Input
          id={`${id}-vigencia`}
          type="date"
          min={hoy}
          disabled={deshabilitado}
          aria-invalid={errorVigencia ? true : undefined}
          aria-describedby={describir(`${id}-vigencia`, Boolean(errorVigencia))}
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
          Vacía si no vence. Al terminar ese día el documento vence y la empresa
          recibe un aviso para renovarlo.
        </FieldDescription>
        <FieldError id={`${id}-vigencia-error`} errors={[errorVigencia]} />
      </Field>

      <Field data-invalid={errorObservaciones ? true : undefined}>
        <FieldLabel htmlFor={`${id}-observaciones`}>
          Observaciones{" "}
          <span className="font-normal text-muted-foreground">(opcional)</span>
        </FieldLabel>
        <Textarea
          id={`${id}-observaciones`}
          rows={2}
          maxLength={LIMITES_VERIFICACION_ANUNCIANTE.observacionesMax}
          disabled={deshabilitado}
          aria-invalid={errorObservaciones ? true : undefined}
          aria-describedby={describir(
            `${id}-observaciones`,
            Boolean(errorObservaciones)
          )}
          {...register("observaciones")}
        />
        <FieldDescription id={`${id}-observaciones-ayuda`}>
          Las ve la empresa junto al documento aprobado.
        </FieldDescription>
        <FieldError
          id={`${id}-observaciones-error`}
          errors={[errorObservaciones]}
        />
      </Field>
    </form>
  )
}

export interface HojaDocumentoAnuncianteProps {
  documento: DocumentoExpediente
  empresa: EmpresaRevisada
  /** `YYYY-MM-DD` de Bogotá (mínimo de la vigencia y base de los atajos). */
  hoy: string
  abierta: boolean
  onAbiertaChange: (abierta: boolean) => void
  /** `anunciantes.verificar`: puede aprobar o rechazar los que esperan revisión. */
  puedeDecidir: boolean
}

/**
 * Revisión de un documento de la empresa: el archivo (URL firmada como
 * servicio, que queda en la bitácora), qué comprobar frente a los datos que
 * registró y la decisión. Uno PENDIENTE se aprueba con vigencia y
 * observaciones o se rechaza con un motivo que la empresa recibe; los demás
 * solo se consultan.
 */
export function HojaDocumentoAnunciante({
  documento,
  empresa,
  hoy,
  abierta,
  onAbiertaChange,
  puedeDecidir,
}: HojaDocumentoAnuncianteProps) {
  const idFormulario = useId()
  const formulario = useFormularioAprobacion(documento)
  const [pendiente, iniciar] = useTransition()
  const [rechazando, setRechazando] = useState(false)
  const porRevisar = puedeDecidir && documento.estado === "PENDIENTE"
  const nombre = tituloDocumento(documento.tipo)
  const enFrase = enFraseDocumento(documento.tipo)

  function terminar(mensaje: string) {
    toast.success(mensaje, {
      description: `${nombre} de ${empresa.nombreComercial}`,
    })
    onAbiertaChange(false)
  }

  function aprobar() {
    iniciar(async () => {
      const resultado = await aprobarDocumentoAnunciante(formulario.getValues())
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
        titulo={porRevisar ? `Revisar ${enFrase}` : nombre}
        descripcion={
          <>
            {empresa.nombreComercial} · cargado el{" "}
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
          archivo={
            <VisorArchivoFirmado
              key={documento.id}
              firmar={() =>
                firmarDocumentoAnunciante({ documentoId: documento.id })
              }
              nombre={nombre}
              tipo={documento.mime ?? undefined}
              descripcion={`${nombre} de ${empresa.nombreComercial}`}
            />
          }
        >
          <DatosDocumento documento={documento} />
          <GuiaDocumento documento={documento} empresa={empresa} />
          {porRevisar ? (
            <FormularioAprobacion
              id={idFormulario}
              formulario={formulario}
              hoy={hoy}
              deshabilitado={pendiente}
              onEnviar={aprobar}
            />
          ) : null}
        </CuerpoRevision>
      </HojaRevision>

      <DialogoMotivo
        abierto={rechazando}
        onAbiertoChange={setRechazando}
        destructivo
        titulo={`¿Rechazar ${enFrase}?`}
        descripcion={
          <>
            <strong>{empresa.nombreComercial}</strong> recibirá un aviso con el
            motivo para cargarlo de nuevo.
          </>
        }
        ayuda="La empresa lo verá tal cual; queda en la bitácora."
        sugerencias={MOTIVOS_RECHAZO_DOCUMENTO}
        placeholder={PLACEHOLDER_MOTIVO}
        textoConfirmar="Rechazar documento"
        onConfirmar={async (motivo) => {
          const resultado = await rechazarDocumentoAnunciante({
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
