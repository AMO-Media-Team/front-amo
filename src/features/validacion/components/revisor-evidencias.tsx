"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  Clock,
  FileSearch,
  History,
  ShieldX,
  TriangleAlert,
} from "lucide-react"
import {
  type TransitionStartFunction,
  useId,
  useState,
  useTransition,
} from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { MarcaPlataforma } from "@/features/operacion/components/distintivos"
import { PLATAFORMAS } from "@/features/operacion/estados"
import {
  cerrarFrase,
  formatearFechaHoraFija,
  formatearHandle,
  formatearRangoCompacto,
} from "@/features/operacion/formato"
import { DialogoMotivo } from "@/features/usuarios/components/dialogo-motivo"
import { aplicarErroresServidor } from "@/features/usuarios/components/errores-formulario"
import { LONGITUD_MAXIMA_MOTIVO } from "@/features/usuarios/schemas"
import { CuerpoRevision } from "@/features/verificacion/components/hoja-revision"
import { formatearNumero } from "@/lib/format"

import { validarEvidencia } from "../actions"
import {
  COMPROBACIONES_EVIDENCIA,
  SUGERENCIAS_RECHAZO_EVIDENCIA,
} from "../decision"
import { CAMPOS_EVIDENCIA, esquemaAprobarEvidencia } from "../schemas"
import type { EvidenciaEnCola } from "../tipos"
import {
  CapturaRevision,
  type CapturaAbierta,
  ErrorFirmas,
  urlCaptura,
  useFirmas,
  VisorCaptura,
} from "./capturas"
import { CabeceraHoja, CuerpoHoja, MarcoHoja, PieHoja } from "./hoja-validacion"
import {
  AbrirPublicacion,
  Comprobaciones,
  Dato,
  type FilaDato,
  Hace,
  ListaDatosRevision,
  textoMedio,
} from "./piezas"
import { type Revisor, useRevisor } from "./use-revisor"

function numeroPublicacion(evidencia: EvidenciaEnCola): string {
  return evidencia.publicaciones > 1
    ? `Publicación ${evidencia.numero} de ${evidencia.publicaciones}`
    : "Publicación única"
}

function TarjetaEvidencia({
  evidencia,
  onRevisar,
}: {
  evidencia: EvidenciaEnCola
  onRevisar: () => void
}) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <MarcaPlataforma
          plataforma={evidencia.plataforma}
          className="[&>span:first-child]:size-11 [&>span:first-child]:rounded-xl [&>span:first-child]:text-xs"
        />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 className="text-[0.9375rem] font-semibold break-words">
            {evidencia.oferta.titulo}
          </h3>
          <p className="text-xs break-words text-muted-foreground">
            <span className="font-medium text-foreground">
              {textoMedio(evidencia.medio)}
            </span>
            {evidencia.oferta.marca ? ` · ${evidencia.oferta.marca}` : ""}
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Dato icono={<FileSearch aria-hidden />}>
              {[evidencia.formato, numeroPublicacion(evidencia)]
                .filter(Boolean)
                .join(" · ")}
            </Dato>
            <Dato icono={<Clock aria-hidden />}>
              <span>
                Cargada <Hace instante={evidencia.enviadaAt} />
              </span>
            </Dato>
          </p>
          {evidencia.observacionesPrevias || !evidencia.etiquetaDeclarada ? (
            <p className="flex flex-wrap items-center gap-2">
              {evidencia.observacionesPrevias ? (
                <span className="inline-flex h-5 items-center gap-1 rounded-full border border-info/40 bg-info/8 px-2 text-[0.6875rem] font-medium text-info">
                  <History aria-hidden className="size-3" />
                  Corregida tras un rechazo
                </span>
              ) : null}
              {!evidencia.etiquetaDeclarada ? (
                <span className="inline-flex h-5 items-center gap-1 rounded-full border border-warning/45 bg-warning/10 px-2 text-[0.6875rem] font-medium text-warning">
                  <TriangleAlert aria-hidden className="size-3" />
                  Sin etiqueta declarada
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>
      <Button
        size="lg"
        className="w-full shrink-0 sm:w-auto"
        aria-label={`Revisar la evidencia de ${evidencia.medio.nombre}: ${evidencia.oferta.titulo}`}
        data-revisar={evidencia.publicacionId}
        onClick={onRevisar}
      >
        Revisar
        <ArrowRight data-icon="inline-end" aria-hidden />
      </Button>
    </article>
  )
}

function datosEvidencia(evidencia: EvidenciaEnCola): FilaDato[] {
  return [
    {
      etiqueta: "Medio y cuenta",
      valor: evidencia.cuentaUrl ? (
        <>
          {evidencia.medio.nombre} ·{" "}
          <a
            href={evidencia.cuentaUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-primary underline-offset-4 hover:underline focus-visible:underline"
          >
            {evidencia.medio.handle
              ? formatearHandle(evidencia.medio.handle)
              : "perfil"}
            <span className="sr-only"> (abre en una pestaña nueva)</span>
          </a>
        </>
      ) : (
        textoMedio(evidencia.medio)
      ),
    },
    {
      etiqueta: "Oferta",
      valor: [evidencia.oferta.titulo, evidencia.oferta.marca]
        .filter(Boolean)
        .join(" · "),
    },
    {
      etiqueta: "Formato",
      valor: [PLATAFORMAS[evidencia.plataforma], evidencia.formato]
        .filter(Boolean)
        .join(" · "),
    },
    { etiqueta: "Número", valor: numeroPublicacion(evidencia) },
    {
      etiqueta: "Publicada",
      valor: formatearFechaHoraFija(evidencia.fechaPublicacion),
    },
    {
      etiqueta: "Ventana de publicación",
      valor: formatearRangoCompacto(
        evidencia.ventanaInicio,
        evidencia.ventanaFin
      ),
      titulo: `${formatearFechaHoraFija(evidencia.ventanaInicio)} – ${formatearFechaHoraFija(evidencia.ventanaFin)}`,
    },
    {
      etiqueta: "Debe seguir publicada hasta",
      valor: formatearFechaHoraFija(evidencia.permanenciaHasta),
    },
    {
      etiqueta: "Etiqueta de publicidad",
      valor: evidencia.etiquetaDeclarada
        ? "Declarada por el medio"
        : "El medio no la declaró",
      destacado: !evidencia.etiquetaDeclarada,
    },
  ]
}

/**
 * La evidencia abierta en la hoja: captura (al lado en escritorio), datos,
 * qué comprobar y la decisión. Aprobar exige marcar que la etiqueta de
 * publicidad es visible; rechazar pide observaciones que el medio recibe.
 */
function RevisionEvidencia({
  evidencia,
  plazoRecargaHoras,
  revisor,
  pendiente,
  iniciar,
}: {
  evidencia: EvidenciaEnCola
  plazoRecargaHoras: number
  revisor: Revisor<EvidenciaEnCola>
  pendiente: boolean
  iniciar: TransitionStartFunction
}) {
  const idFormulario = useId()
  const idEtiqueta = useId()
  const [rechazando, setRechazando] = useState(false)
  const [abierta, setAbierta] = useState<CapturaAbierta | null>(null)
  const firmas = useFirmas(evidencia.asignacionId, evidencia.conImagen)
  const imagen =
    firmas.estado.tipo === "listo"
      ? firmas.estado.imagenes.publicaciones[evidencia.publicacionId]
      : undefined
  const formulario = useForm({
    resolver: zodResolver(esquemaAprobarEvidencia),
    defaultValues: {
      publicacionId: evidencia.publicacionId,
      etiquetaVerificada: false,
      observaciones: "",
    },
    mode: "onTouched",
  })
  const { register, control, formState, handleSubmit } = formulario
  const errorGeneral = formState.errors.root?.servidor?.message
  const descripcionCaptura = `Captura de la ${numeroPublicacion(evidencia).toLocaleLowerCase("es-CO")} de ${evidencia.medio.nombre}`

  function ampliar() {
    firmas.asegurarVigentes()
    setAbierta({
      origen: "publicaciones",
      id: evidencia.publicacionId,
      titulo: numeroPublicacion(evidencia),
      descripcion: `${evidencia.medio.nombre} · publicada el ${cerrarFrase(formatearFechaHoraFija(evidencia.fechaPublicacion))}`,
    })
  }

  const aprobar = handleSubmit(() => {
    const proximo = revisor.proximoDe(evidencia.publicacionId)
    iniciar(async () => {
      const resultado = await validarEvidencia({
        aprobar: true,
        ...formulario.getValues(),
      })
      if (!resultado.ok) {
        aplicarErroresServidor(formulario.setError, resultado, CAMPOS_EVIDENCIA)
        return
      }
      toast.success(
        resultado.datos.estadoAsignacion === "EVIDENCIA_VALIDADA"
          ? "Evidencia aprobada: la asignación quedó con su evidencia validada"
          : "Evidencia aprobada",
        {
          description: `${evidencia.medio.nombre} · ${evidencia.oferta.titulo}`,
        }
      )
      revisor.decidido(evidencia.publicacionId, proximo)
    })
  })

  return (
    <>
      <CabeceraHoja
        icono={FileSearch}
        titulo={`Evidencia de ${evidencia.medio.nombre}`}
        descripcion={
          <>
            {evidencia.oferta.titulo} · {numeroPublicacion(evidencia)} · cargada{" "}
            <Hace instante={evidencia.enviadaAt} />
          </>
        }
        enfocar={revisor.enfocar}
        bloqueada={pendiente}
        onCerrar={revisor.cerrar}
      />
      <CuerpoHoja>
        <CuerpoRevision
          archivo={
            <div className="flex flex-col gap-3">
              {firmas.estado.tipo === "error" ? (
                <ErrorFirmas
                  mensaje={firmas.estado.mensaje}
                  onReintentar={firmas.firmar}
                />
              ) : null}
              <CapturaRevision
                url={evidencia.conImagen ? (imagen?.captura ?? null) : null}
                cargando={
                  evidencia.conImagen &&
                  firmas.estado.tipo === "cargando" &&
                  !imagen
                }
                etiqueta={descripcionCaptura}
                onAmpliar={ampliar}
              />
            </div>
          }
        >
          <AbrirPublicacion url={evidencia.urlPost} />
          {evidencia.observacionesPrevias ? (
            <Alert>
              <History aria-hidden />
              <AlertTitle>Revisión anterior</AlertTitle>
              <AlertDescription>
                {evidencia.observacionesPrevias}
              </AlertDescription>
            </Alert>
          ) : null}
          <ListaDatosRevision filas={datosEvidencia(evidencia)} />
          <Comprobaciones puntos={COMPROBACIONES_EVIDENCIA} />
          <form
            id={idFormulario}
            noValidate
            onSubmit={aprobar}
            aria-busy={pendiente || undefined}
            className="flex flex-col gap-4"
          >
            {errorGeneral ? (
              <Alert variant="destructive" role="alert">
                <CircleAlert aria-hidden />
                <AlertDescription>{errorGeneral}</AlertDescription>
              </Alert>
            ) : null}
            <Controller
              control={control}
              name="etiquetaVerificada"
              render={({ field, fieldState }) => (
                <Field
                  orientation="horizontal"
                  data-invalid={fieldState.invalid || undefined}
                  className="rounded-xl border bg-card/40 p-3.5"
                >
                  <Checkbox
                    id={idEtiqueta}
                    ref={field.ref}
                    checked={field.value === true}
                    onCheckedChange={(valor) => {
                      field.onChange(valor === true)
                      field.onBlur()
                    }}
                    disabled={pendiente}
                    aria-invalid={fieldState.invalid || undefined}
                    aria-describedby={
                      fieldState.error
                        ? `${idEtiqueta}-ayuda ${idEtiqueta}-error`
                        : `${idEtiqueta}-ayuda`
                    }
                    className="mt-0.5"
                  />
                  <FieldContent className="gap-1">
                    <FieldLabel htmlFor={idEtiqueta} className="leading-snug">
                      La etiqueta de publicidad es visible
                    </FieldLabel>
                    <FieldDescription id={`${idEtiqueta}-ayuda`}>
                      Márcala solo si la viste en la publicación o en la
                      captura. Es obligatoria para aprobar.
                    </FieldDescription>
                    <FieldError
                      id={`${idEtiqueta}-error`}
                      errors={[fieldState.error]}
                    />
                  </FieldContent>
                </Field>
              )}
            />
            <Field
              data-invalid={formState.errors.observaciones ? true : undefined}
            >
              <FieldLabel htmlFor={`${idFormulario}-observaciones`}>
                Observaciones{" "}
                <span className="font-normal text-muted-foreground">
                  (opcional)
                </span>
              </FieldLabel>
              <Textarea
                id={`${idFormulario}-observaciones`}
                rows={2}
                maxLength={LONGITUD_MAXIMA_MOTIVO}
                disabled={pendiente}
                aria-invalid={formState.errors.observaciones ? true : undefined}
                aria-describedby={`${idFormulario}-observaciones-ayuda${
                  formState.errors.observaciones
                    ? ` ${idFormulario}-observaciones-error`
                    : ""
                }`}
                {...register("observaciones")}
              />
              <FieldDescription id={`${idFormulario}-observaciones-ayuda`}>
                Quedan con la evidencia aprobada y en la bitácora.
              </FieldDescription>
              <FieldError
                id={`${idFormulario}-observaciones-error`}
                errors={[formState.errors.observaciones]}
              />
            </Field>
          </form>
        </CuerpoRevision>
      </CuerpoHoja>
      <PieHoja>
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
      </PieHoja>

      <VisorCaptura
        abierta={abierta}
        url={urlCaptura(firmas.estado, abierta)}
        onCerrar={() => setAbierta(null)}
      />
      <DialogoMotivo
        abierto={rechazando}
        onAbiertoChange={setRechazando}
        destructivo
        titulo="¿Rechazar la evidencia?"
        descripcion={
          <>
            <strong>{evidencia.medio.nombre}</strong> recibe un aviso con tus
            observaciones y tiene al menos {formatearNumero(plazoRecargaHoras)}{" "}
            {plazoRecargaHoras === 1 ? "hora" : "horas"} para cargar una
            evidencia nueva. La asignación vuelve a «Contenido entregado».
          </>
        }
        etiqueta="Observaciones para el medio"
        placeholder="Ej.: falta la etiqueta de publicidad en la publicación…"
        ayuda="El medio las verá tal cual; quedan en la bitácora."
        sugerencias={SUGERENCIAS_RECHAZO_EVIDENCIA}
        textoConfirmar="Rechazar evidencia"
        focoAlCerrar={revisor.focoTrasDialogo}
        onConfirmar={async (observaciones) => {
          const proximo = revisor.proximoDe(evidencia.publicacionId)
          const resultado = await validarEvidencia({
            aprobar: false,
            publicacionId: evidencia.publicacionId,
            observaciones,
          })
          if (resultado.ok) {
            const plazo = resultado.datos.fechaLimitePublicacion
            toast.success("Evidencia rechazada", {
              description: plazo
                ? `${evidencia.medio.nombre} puede cargar otra hasta el ${cerrarFrase(formatearFechaHoraFija(plazo))}`
                : `${evidencia.medio.nombre} recibió tus observaciones.`,
            })
            revisor.decidido(evidencia.publicacionId, proximo)
          }
          return resultado
        }}
      />
    </>
  )
}

/**
 * Cola de evidencias con una sola hoja de revisión: al aprobar o rechazar una
 * se abre la siguiente, para atender la cola de corrido. La lista se
 * actualiza sola (la acción revalida la página).
 */
export function RevisorEvidencias({
  evidencias,
  plazoRecargaHoras,
}: {
  evidencias: readonly EvidenciaEnCola[]
  plazoRecargaHoras: number
}) {
  const revisor = useRevisor(evidencias, (evidencia) => evidencia.publicacionId)
  const [pendiente, iniciar] = useTransition()
  const { actual } = revisor

  return (
    <>
      <ol aria-label="Evidencias por validar" className="flex flex-col gap-3">
        {evidencias.map((evidencia) => (
          <li key={evidencia.publicacionId}>
            <TarjetaEvidencia
              evidencia={evidencia}
              onRevisar={() => revisor.abrir(evidencia)}
            />
          </li>
        ))}
      </ol>
      <MarcoHoja
        abierta={revisor.abierta}
        onAbiertaChange={(abierta) => {
          if (!abierta) revisor.cerrar()
        }}
        bloqueada={pendiente}
        focoAlCerrar={revisor.focoAlCerrar}
      >
        {actual ? (
          <RevisionEvidencia
            key={actual.publicacionId}
            evidencia={actual}
            plazoRecargaHoras={plazoRecargaHoras}
            revisor={revisor}
            pendiente={pendiente}
            iniciar={iniciar}
          />
        ) : null}
      </MarcoHoja>
    </>
  )
}
