"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  ArrowRight,
  ChartColumnBig,
  CircleAlert,
  CircleCheck,
  Clock,
  FileWarning,
  History,
  ShieldX,
  TriangleAlert,
} from "lucide-react"
import Link from "next/link"
import {
  type TransitionStartFunction,
  useId,
  useState,
  useTransition,
} from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

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
import { tituloCorte } from "@/features/ejecucion/cortes"
import {
  alertaRevisable,
  camposSenalados,
  motivosAlerta,
  motivosAlertaPrevia,
  resumirMotivo,
  tieneAlerta,
} from "@/features/operacion/alertas"
import { MarcaPlataforma } from "@/features/operacion/components/distintivos"
import { PorqueAlerta } from "@/features/operacion/components/porque-alerta"
import { PLATAFORMAS } from "@/features/operacion/estados"
import {
  cerrarFrase,
  formatearFechaHoraFija,
  formatearRangoCompacto,
} from "@/features/operacion/formato"
import { nombresColumnas } from "@/features/operacion/metricas"
import { rutaAsignacion } from "@/features/operacion/rutas"
import { DialogoMotivo } from "@/features/usuarios/components/dialogo-motivo"
import { aplicarErroresServidor } from "@/features/usuarios/components/errores-formulario"
import { LONGITUD_MAXIMA_MOTIVO } from "@/features/usuarios/schemas"
import { CuerpoRevision } from "@/features/verificacion/components/hoja-revision"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import { validarMetrica } from "../actions"
import { rutaCola } from "../colas"
import {
  BLOQUEO_EVIDENCIA_SIN_APROBAR,
  COMPROBACIONES_METRICA,
  DETALLE_RECHAZO_EN_DISPUTA,
  SUGERENCIAS_RECHAZO_METRICA,
  SUGERENCIAS_REVISION_ALERTA,
} from "../decision"
import { esperaDisputa } from "../errores"
import { CAMPOS_METRICA, esquemaAprobarMetrica } from "../schemas"
import type { MetricaEnCola } from "../tipos"
import {
  type CapturaAbierta,
  CapturaRevision,
  ErrorFirmas,
  urlCaptura,
  useFirmas,
  VisorCaptura,
} from "./capturas"
import { CifrasMetrica } from "./cifras-metrica"
import { CabeceraHoja, CuerpoHoja, MarcoHoja, PieHoja } from "./hoja-validacion"
import {
  Comprobaciones,
  Dato,
  EsperaDisputa,
  type FilaDato,
  Hace,
  ListaDatosRevision,
  textoMedio,
} from "./piezas"
import { type Revisor, useRevisor } from "./use-revisor"

/** «Métricas de 24 horas · publicación 2», con el periodo si es personalizado. */
function nombreCorte(metrica: MetricaEnCola): string {
  const periodo = metrica.periodo
    ? ` (${formatearRangoCompacto(metrica.periodo.desde, metrica.periodo.hasta)})`
    : ""
  return `${tituloCorte(metrica.corte)}${periodo}`
}

function CifrasClave({ metrica }: { metrica: MetricaEnCola }) {
  const columnas = nombresColumnas(metrica.plataforma)
  const alcance =
    metrica.plataforma === "TIKTOK"
      ? metrica.valores.espectadoresUnicos
      : metrica.valores.alcance
  const impresiones =
    metrica.plataforma === "TIKTOK"
      ? metrica.valores.reproducciones
      : metrica.valores.impresiones
  return (
    <span className="text-xs text-muted-foreground">
      {columnas.alcance}{" "}
      <span className="font-medium cifras text-foreground">
        {alcance === null ? "—" : formatearNumero(alcance)}
      </span>{" "}
      · {columnas.impresiones}{" "}
      <span className="font-medium cifras text-foreground">
        {impresiones === null ? "—" : formatearNumero(impresiones)}
      </span>
    </span>
  )
}

/**
 * La alerta en una línea para la tarjeta: las razones de hoy o, si el medio
 * ya la corrigió, las que tuvo (cuenta igual: pide constancia al aprobar).
 */
function resumenAlerta(metrica: MetricaEnCola): string | null {
  if (!alertaRevisable(metrica.alerta)) return null
  if (tieneAlerta(metrica.alerta)) {
    const motivos = motivosAlerta(metrica.alerta, metrica.plataforma)
    return `Con alerta: ${motivos.map(resumirMotivo).join(" · ")}`
  }
  const previos = motivosAlertaPrevia(metrica.alerta, metrica.plataforma)
  return previos.length > 0
    ? `Tuvo alerta antes de corregirse: ${previos.map(resumirMotivo).join(" · ")}`
    : "Tuvo alerta antes de corregirse"
}

function TarjetaMetrica({
  metrica,
  onRevisar,
}: {
  metrica: MetricaEnCola
  onRevisar: () => void
}) {
  const alerta = resumenAlerta(metrica)
  const conAlerta = alerta !== null
  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between",
        conAlerta && "border-warning/45"
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <MarcaPlataforma
          plataforma={metrica.plataforma}
          className="[&>span:first-child]:size-11 [&>span:first-child]:rounded-xl [&>span:first-child]:text-xs"
        />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 className="text-[0.9375rem] font-semibold break-words">
            {nombreCorte(metrica)}
          </h3>
          <p className="text-xs break-words text-muted-foreground">
            <span className="font-medium text-foreground">
              {textoMedio(metrica.medio)}
            </span>{" "}
            · {metrica.ofertaTitulo} · publicación {metrica.numero}
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <CifrasClave metrica={metrica} />
            <Dato icono={<Clock aria-hidden />}>
              <span>
                Cargada <Hace instante={metrica.enviadaAt} />
              </span>
            </Dato>
          </p>
          {conAlerta || !metrica.evidenciaAprobada || metrica.observaciones ? (
            <p className="flex flex-wrap items-center gap-2">
              {alerta ? (
                <span className="inline-flex min-h-5 items-center gap-1 rounded-full border border-warning/45 bg-warning/10 px-2 py-0.5 text-[0.6875rem] font-medium text-warning">
                  <TriangleAlert aria-hidden className="size-3 shrink-0" />
                  {alerta}
                </span>
              ) : null}
              {!metrica.evidenciaAprobada ? (
                <span className="inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[0.6875rem] font-medium text-muted-foreground">
                  <FileWarning aria-hidden className="size-3" />
                  Evidencia sin validar
                </span>
              ) : null}
              {metrica.observaciones ? (
                <span className="inline-flex h-5 items-center gap-1 rounded-full border border-info/40 bg-info/8 px-2 text-[0.6875rem] font-medium text-info">
                  <History aria-hidden className="size-3" />
                  Corregida tras un rechazo
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>
      <Button
        size="lg"
        className="w-full shrink-0 sm:w-auto"
        aria-label={`Revisar ${nombreCorte(metrica).toLocaleLowerCase("es-CO")} de ${metrica.medio.nombre}: ${metrica.ofertaTitulo}${conAlerta ? " (con alerta)" : ""}`}
        data-revisar={metrica.metricaId}
        onClick={onRevisar}
      >
        Revisar
        <ArrowRight data-icon="inline-end" aria-hidden />
      </Button>
    </article>
  )
}

function datosMetrica(metrica: MetricaEnCola): FilaDato[] {
  return [
    { etiqueta: "Medio y cuenta", valor: textoMedio(metrica.medio) },
    {
      etiqueta: "Seguidores al aceptar",
      valor:
        metrica.seguidoresAlAceptar === null
          ? "—"
          : formatearNumero(metrica.seguidoresAlAceptar),
    },
    { etiqueta: "Oferta", valor: metrica.ofertaTitulo },
    {
      etiqueta: "Formato",
      valor: [PLATAFORMAS[metrica.plataforma], metrica.formato]
        .filter(Boolean)
        .join(" · "),
    },
    {
      etiqueta: "Captura tomada",
      valor: formatearFechaHoraFija(metrica.fechaCorte),
    },
    {
      etiqueta: "Asignación",
      valor: (
        <Link
          href={rutaAsignacion(metrica.asignacionId)}
          className="text-primary underline-offset-4 hover:underline focus-visible:underline"
        >
          Ver la ficha
        </Link>
      ),
    },
  ]
}

/**
 * La métrica abierta en la hoja: la captura a un lado y, al otro, las cifras
 * y —si tiene alerta, hoy o antes de corregirse— su porqué (ADM-008 c1).
 * Aprobar una con alerta exige anotar qué se revisó; rechazar pide
 * observaciones para el medio. Si la asignación entró en disputa con todo
 * cargado (hint `en_disputa`), el rechazo deja de ofrecerse y se explica.
 */
function RevisionMetrica({
  metrica,
  revisor,
  pendiente,
  iniciar,
}: {
  metrica: MetricaEnCola
  revisor: Revisor<MetricaEnCola>
  pendiente: boolean
  iniciar: TransitionStartFunction
}) {
  const idFormulario = useId()
  const idBloqueo = useId()
  const [rechazando, setRechazando] = useState(false)
  // El rechazo espera a la disputa: lo dijo la BD al intentarlo.
  const [rechazoEnDisputa, setRechazoEnDisputa] = useState(false)
  const [abierta, setAbierta] = useState<CapturaAbierta | null>(null)
  const firmas = useFirmas(metrica.asignacionId, metrica.conImagen)
  const imagen =
    firmas.estado.tipo === "listo"
      ? firmas.estado.imagenes.metricas[metrica.metricaId]
      : undefined
  // También la que tuvo alerta antes de corregirse: pide constancia igual.
  const conAlerta = alertaRevisable(metrica.alerta)
  const formulario = useForm({
    resolver: zodResolver(esquemaAprobarMetrica),
    defaultValues: {
      metricaId: metrica.metricaId,
      conAlerta,
      observaciones: "",
    },
    mode: "onTouched",
  })
  const { register, formState, handleSubmit, setValue } = formulario
  const errorGeneral = formState.errors.root?.servidor?.message
  const errorObservaciones = formState.errors.observaciones
  const bloqueo = metrica.evidenciaAprobada
    ? null
    : BLOQUEO_EVIDENCIA_SIN_APROBAR
  const titulo = nombreCorte(metrica)

  function ampliar() {
    firmas.asegurarVigentes()
    setAbierta({
      origen: "metricas",
      id: metrica.metricaId,
      titulo,
      descripcion: `${metrica.medio.nombre} · captura del ${cerrarFrase(formatearFechaHoraFija(metrica.fechaCorte))}`,
    })
  }

  const aprobar = handleSubmit(() => {
    if (bloqueo) return
    const proximo = revisor.proximoDe(metrica.metricaId)
    iniciar(async () => {
      const resultado = await validarMetrica({
        aprobar: true,
        ...formulario.getValues(),
      })
      if (!resultado.ok) {
        aplicarErroresServidor(formulario.setError, resultado, CAMPOS_METRICA)
        return
      }
      toast.success("Métrica aprobada", {
        description: `${metrica.medio.nombre} · ${titulo}`,
      })
      revisor.decidido(metrica.metricaId, proximo)
    })
  })

  const idObservaciones = `${idFormulario}-observaciones`

  return (
    <>
      <CabeceraHoja
        icono={conAlerta ? TriangleAlert : ChartColumnBig}
        titulo={`${titulo} de ${metrica.medio.nombre}`}
        descripcion={
          <>
            {metrica.ofertaTitulo} · publicación {metrica.numero} · cargada{" "}
            <Hace instante={metrica.enviadaAt} />
            {conAlerta ? " · con alerta" : ""}
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
                url={metrica.conImagen ? (imagen?.captura ?? null) : null}
                cargando={
                  metrica.conImagen &&
                  firmas.estado.tipo === "cargando" &&
                  !imagen
                }
                etiqueta={`Captura del panel: ${titulo.toLocaleLowerCase("es-CO")} de ${metrica.medio.nombre}`}
                onAmpliar={ampliar}
              />
            </div>
          }
        >
          {conAlerta ? (
            <PorqueAlerta
              alerta={metrica.alerta}
              plataforma={metrica.plataforma}
            />
          ) : null}
          <CifrasMetrica
            plataforma={metrica.plataforma}
            formato={metrica.formatoClave}
            valores={metrica.valores}
            interacciones={metrica.interacciones}
            destacadas={camposSenalados(metrica.alerta, metrica.plataforma)}
          />
          {metrica.observaciones ? (
            <Alert>
              <History aria-hidden />
              <AlertTitle>Revisión anterior</AlertTitle>
              <AlertDescription>{metrica.observaciones}</AlertDescription>
            </Alert>
          ) : null}
          <ListaDatosRevision filas={datosMetrica(metrica)} />
          <Comprobaciones puntos={COMPROBACIONES_METRICA} />
          {bloqueo ? (
            <Alert id={idBloqueo} className="border-warning/45 bg-warning/10">
              <FileWarning aria-hidden />
              <AlertTitle>Aún no se puede aprobar</AlertTitle>
              <AlertDescription>
                <p>{bloqueo}</p>
                <Link
                  href={rutaCola("evidencias")}
                  className="font-medium text-primary underline-offset-4 hover:underline focus-visible:underline"
                >
                  Ir a la cola de evidencias
                </Link>
              </AlertDescription>
            </Alert>
          ) : null}
          {rechazoEnDisputa ? (
            <EsperaDisputa
              detalle={DETALLE_RECHAZO_EN_DISPUTA}
              enlace={{
                href: rutaAsignacion(metrica.asignacionId),
                etiqueta: "Ver la asignación y su disputa",
              }}
            />
          ) : null}
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
            <Field data-invalid={errorObservaciones ? true : undefined}>
              <FieldLabel htmlFor={idObservaciones}>
                {conAlerta ? (
                  "Qué revisaste"
                ) : (
                  <>
                    Observaciones{" "}
                    <span className="font-normal text-muted-foreground">
                      (opcional)
                    </span>
                  </>
                )}
              </FieldLabel>
              {conAlerta ? (
                <div
                  role="group"
                  aria-label="Revisiones frecuentes"
                  className="flex flex-col gap-1.5"
                >
                  {SUGERENCIAS_REVISION_ALERTA.map((sugerencia) => (
                    <button
                      key={sugerencia}
                      type="button"
                      disabled={pendiente}
                      onClick={() =>
                        setValue("observaciones", sugerencia, {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                      className="w-full rounded-lg border px-3 py-2 text-left text-xs text-pretty transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
                    >
                      {sugerencia}
                    </button>
                  ))}
                </div>
              ) : null}
              <Textarea
                id={idObservaciones}
                rows={conAlerta ? 3 : 2}
                maxLength={LONGITUD_MAXIMA_MOTIVO}
                disabled={pendiente}
                placeholder={
                  conAlerta
                    ? "Ej.: comparé el alcance con la captura y coincide; la publicación se compartió mucho…"
                    : undefined
                }
                aria-invalid={errorObservaciones ? true : undefined}
                aria-describedby={`${idObservaciones}-ayuda${
                  errorObservaciones ? ` ${idObservaciones}-error` : ""
                }`}
                {...register("observaciones")}
              />
              <FieldDescription id={`${idObservaciones}-ayuda`}>
                {conAlerta
                  ? "Obligatorio para aprobar una métrica con alerta: queda como constancia en la bitácora."
                  : "Quedan con la métrica aprobada y en la bitácora."}
              </FieldDescription>
              <FieldError
                id={`${idObservaciones}-error`}
                errors={[errorObservaciones]}
              />
            </Field>
          </form>
        </CuerpoRevision>
      </CuerpoHoja>
      <PieHoja>
        {rechazoEnDisputa ? null : (
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
        )}
        <Button
          type="submit"
          form={idFormulario}
          size="lg"
          disabled={pendiente || bloqueo !== null}
          aria-describedby={bloqueo ? idBloqueo : undefined}
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
        titulo="¿Rechazar la métrica?"
        descripcion={
          <>
            <strong>{metrica.medio.nombre}</strong> recibe un aviso con tus
            observaciones para corregir las cifras de este corte.
            {metrica.estadoAsignacion === "METRICAS_CARGADAS"
              ? " La asignación vuelve a «Evidencia validada» hasta que las corrija."
              : ""}
          </>
        }
        etiqueta="Observaciones para el medio"
        placeholder="Ej.: el alcance no coincide con la captura del panel…"
        ayuda="El medio las verá tal cual; quedan en la bitácora."
        sugerencias={SUGERENCIAS_RECHAZO_METRICA}
        textoConfirmar="Rechazar métrica"
        focoAlCerrar={revisor.focoTrasDialogo}
        onConfirmar={async (observaciones) => {
          const proximo = revisor.proximoDe(metrica.metricaId)
          const resultado = await validarMetrica({
            aprobar: false,
            metricaId: metrica.metricaId,
            observaciones,
          })
          if (esperaDisputa(resultado, "rechazoMetrica")) {
            setRechazoEnDisputa(true)
          }
          if (resultado.ok) {
            toast.success("Métrica rechazada", {
              description: `${metrica.medio.nombre} recibió tus observaciones.`,
            })
            revisor.decidido(metrica.metricaId, proximo)
          }
          return resultado
        }}
      />
    </>
  )
}

/**
 * Cola de métricas con una sola hoja de revisión: al aprobar o rechazar una
 * se abre la siguiente. Las que tienen alerta van primero (lo ordena la BD).
 */
export function RevisorMetricas({
  metricas,
}: {
  metricas: readonly MetricaEnCola[]
}) {
  const revisor = useRevisor(metricas, (metrica) => metrica.metricaId)
  const [pendiente, iniciar] = useTransition()
  const { actual } = revisor

  return (
    <>
      <ol aria-label="Métricas por validar" className="flex flex-col gap-3">
        {metricas.map((metrica) => (
          <li key={metrica.metricaId}>
            <TarjetaMetrica
              metrica={metrica}
              onRevisar={() => revisor.abrir(metrica)}
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
          <RevisionMetrica
            key={actual.metricaId}
            metrica={actual}
            revisor={revisor}
            pendiente={pendiente}
            iniciar={iniciar}
          />
        ) : null}
      </MarcoHoja>
    </>
  )
}
