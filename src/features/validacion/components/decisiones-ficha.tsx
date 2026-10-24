"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  CircleAlert,
  CircleCheck,
  CircleHelp,
  ExternalLink,
  PencilLine,
  ShieldX,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useRef, useState, useTransition } from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import { alertaRevisable, frasesAlerta } from "@/features/operacion/alertas"
import { CORTES, type Plataforma } from "@/features/operacion/estados"
import {
  cerrarFrase,
  formatearFechaHoraFija,
} from "@/features/operacion/formato"
import type { CorteMetrica } from "@/features/operacion/metricas"
import type { PublicacionEvidencia } from "@/features/operacion/tipos"
import { DialogoMotivo } from "@/features/usuarios/components/dialogo-motivo"
import { aplicarErroresServidor } from "@/features/usuarios/components/errores-formulario"
import { LONGITUD_MAXIMA_MOTIVO } from "@/features/usuarios/schemas"

import { validarEvidencia, validarMetrica } from "../actions"
import {
  type AccionesCorte,
  SUGERENCIAS_RECHAZO_EVIDENCIA,
  SUGERENCIAS_RECHAZO_METRICA,
  SUGERENCIAS_REVISION_ALERTA,
  TEXTO_VUELVE_TRAS_RECHAZO_EVIDENCIA,
} from "../decision"
import {
  type DecisionEnDisputa,
  type ElementoValidado,
  elementoCambiado,
  esperaDisputa,
} from "../errores"
import { CAMPOS_EVIDENCIA, esquemaAprobarEvidencia } from "../schemas"

/** Id del encabezado de una publicación en la ficha (destino del foco). */
export function idPublicacion(publicacionId: string): string {
  return `publicacion-${publicacionId}`
}

/** Id del encabezado de fila de un corte en la ficha (destino del foco). */
export function idCorte(metricaId: string): string {
  return `corte-${metricaId}`
}

function porId(id: string): () => HTMLElement | null {
  return () => document.getElementById(id)
}

/**
 * Hubo cambio: el botón que abrió el diálogo desaparece (la evidencia o el
 * corte ya no están pendientes) y el foco va al encabezado que se indica; si
 * no hubo cambio, vuelve al botón.
 */
function useFocoTrasDecision(destino: () => HTMLElement | null) {
  const cambio = useRef(false)
  return {
    reiniciar: () => {
      cambio.current = false
    },
    anotar: () => {
      cambio.current = true
    },
    focoAlCerrar: () => (cambio.current ? destino() : null),
  }
}

/**
 * La decisión no se aplicó porque la asignación entró en disputa (hint
 * `en_disputa`) o porque el medio cambió lo que se revisaba (hints
 * `evidencia_cambiada` y `metrica_cambiada`): el diálogo muestra el porqué y,
 * al cerrarlo, la ficha se refresca para cambiar la decisión por la
 * explicación o para mostrar la versión nueva antes de decidir (el foco va al
 * encabezado, que sigue ahí).
 */
function useRefrescoTrasFallo(
  decision: DecisionEnDisputa,
  elemento: ElementoValidado,
  foco: ReturnType<typeof useFocoTrasDecision>
) {
  const router = useRouter()
  const refrescar = useRef(false)
  return {
    revisar: (resultado: { ok: boolean; error?: string }) => {
      if (
        !esperaDisputa(resultado, decision) &&
        !elementoCambiado(resultado, elemento)
      ) {
        return
      }
      refrescar.current = true
      foco.anotar()
    },
    alCerrar: () => {
      if (!refrescar.current) return
      refrescar.current = false
      router.refresh()
    },
  }
}

// ── Evidencia ────────────────────────────────────────────────────────────────

/**
 * Aprobar la evidencia desde la ficha: la casilla de la etiqueta de
 * publicidad visible es obligatoria (el MISMO esquema que la hoja de la
 * cola); las observaciones, opcionales.
 */
function DialogoAprobarEvidencia({
  abierto,
  onAbiertoChange,
  publicacion,
  enviadaAt,
  focoAlCerrar,
  onAprobada,
  onFallo,
}: {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  publicacion: PublicacionEvidencia
  /** Versión que mostraba la ficha al abrir el diálogo (`updated_at`). */
  enviadaAt: string
  focoAlCerrar: () => HTMLElement | null
  onAprobada: () => void
  /** El resultado de un intento fallido (por si la decisión espera a la disputa). */
  onFallo: (resultado: { ok: boolean; error?: string }) => void
}) {
  const idCasilla = useId()
  const idObservaciones = useId()
  const [pendiente, iniciar] = useTransition()
  const formulario = useForm({
    resolver: zodResolver(esquemaAprobarEvidencia),
    defaultValues: {
      publicacionId: publicacion.id,
      etiquetaVerificada: false,
      observaciones: "",
    },
    mode: "onTouched",
  })
  const { control, register, formState, handleSubmit, reset } = formulario
  const errorGeneral = formState.errors.root?.servidor?.message

  function cambiarAbierto(valor: boolean) {
    if (pendiente) return
    if (!valor) reset()
    onAbiertoChange(valor)
  }

  const aprobar = handleSubmit(() =>
    iniciar(async () => {
      const resultado = await validarEvidencia({
        aprobar: true,
        ...formulario.getValues(),
        enviadaAt,
      })
      if (!resultado.ok) {
        aplicarErroresServidor(formulario.setError, resultado, CAMPOS_EVIDENCIA)
        onFallo(resultado)
        return
      }
      onAprobada()
      toast.success(
        resultado.datos.estadoAsignacion === "EVIDENCIA_VALIDADA"
          ? "Evidencia aprobada: la asignación quedó con su evidencia validada"
          : "Evidencia aprobada"
      )
      reset()
      onAbiertoChange(false)
    })
  )

  return (
    <AlertDialog open={abierto} onOpenChange={cambiarAbierto}>
      <AlertDialogContent className="sm:max-w-lg" finalFocus={focoAlCerrar}>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-primary/10 text-primary">
            <CircleHelp aria-hidden />
          </AlertDialogMedia>
          <AlertDialogTitle>¿Aprobar la evidencia?</AlertDialogTitle>
          <AlertDialogDescription>
            Confirma que viste la publicación: con todas aprobadas, la
            asignación pasa a «Evidencia validada» y el medio sigue con las
            métricas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form
          id={`${idCasilla}-formulario`}
          noValidate
          onSubmit={aprobar}
          className="grid gap-4"
        >
          <a
            href={publicacion.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex w-fit max-w-full items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline focus-visible:underline"
          >
            <span className="truncate">Abrir la publicación</span>
            <ExternalLink aria-hidden className="size-3.5 shrink-0" />
            <span className="sr-only"> (abre en una pestaña nueva)</span>
          </a>
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
                  id={idCasilla}
                  ref={field.ref}
                  checked={field.value === true}
                  onCheckedChange={(valor) => {
                    field.onChange(valor === true)
                    field.onBlur()
                  }}
                  disabled={pendiente}
                  aria-invalid={fieldState.invalid || undefined}
                  aria-describedby={
                    fieldState.error ? `${idCasilla}-error` : undefined
                  }
                  className="mt-0.5"
                />
                <FieldContent className="gap-1">
                  <FieldLabel htmlFor={idCasilla} className="leading-snug">
                    La etiqueta de publicidad es visible
                  </FieldLabel>
                  <FieldError
                    id={`${idCasilla}-error`}
                    errors={[fieldState.error]}
                  />
                </FieldContent>
              </Field>
            )}
          />
          <Field
            data-invalid={formState.errors.observaciones ? true : undefined}
          >
            <FieldLabel htmlFor={idObservaciones}>
              Observaciones{" "}
              <span className="font-normal text-muted-foreground">
                (opcional)
              </span>
            </FieldLabel>
            <Textarea
              id={idObservaciones}
              rows={2}
              maxLength={LONGITUD_MAXIMA_MOTIVO}
              disabled={pendiente}
              aria-invalid={formState.errors.observaciones ? true : undefined}
              aria-describedby={`${idObservaciones}-ayuda${
                formState.errors.observaciones
                  ? ` ${idObservaciones}-error`
                  : ""
              }`}
              {...register("observaciones")}
            />
            <FieldDescription id={`${idObservaciones}-ayuda`}>
              Quedan con la evidencia aprobada y en la bitácora.
            </FieldDescription>
            <FieldError
              id={`${idObservaciones}-error`}
              errors={[formState.errors.observaciones]}
            />
          </Field>
          {errorGeneral ? (
            <p role="alert" className="flex gap-2 text-sm text-destructive">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {errorGeneral}
            </p>
          ) : null}
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pendiente}>Cancelar</AlertDialogCancel>
          <Button
            type="submit"
            form={`${idCasilla}-formulario`}
            disabled={pendiente}
          >
            {pendiente ? (
              <Spinner aria-label="Aprobando" data-icon="inline-start" />
            ) : null}
            Aprobar evidencia
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Aprobar o rechazar la evidencia de una publicación desde la ficha (ADM-007),
 * con los mismos controles que la cola. Tras decidir, el foco va al
 * encabezado de la publicación (los botones desaparecen). Se decide sobre la
 * versión que mostraba la ficha al abrir el diálogo: si el medio la cambió
 * mientras tanto, la BD no decide y, al cerrar, la ficha muestra la nueva.
 */
export function DecisionEvidencia({
  publicacion,
  medio = null,
}: {
  publicacion: PublicacionEvidencia
  /** Nombre del medio, para el diálogo de rechazo. */
  medio?: string | null
}) {
  const [dialogo, setDialogo] = useState<"aprobar" | "rechazar" | null>(null)
  // La versión que se ve al abrir: un refresco con el diálogo abierto no la cambia.
  const [versionVista, setVersionVista] = useState(publicacion.actualizadaAt)
  const foco = useFocoTrasDecision(porId(idPublicacion(publicacion.id)))
  const refresco = useRefrescoTrasFallo("evidencia", "evidencia", foco)

  function abrir(tipo: "aprobar" | "rechazar") {
    foco.reiniciar()
    setVersionVista(publicacion.actualizadaAt)
    setDialogo(tipo)
  }

  function cerrar(abierto: boolean) {
    if (abierto) return
    setDialogo(null)
    refresco.alCerrar()
  }

  return (
    <div
      role="group"
      aria-label={`Validar la evidencia de la publicación ${publicacion.numero}`}
      className="flex flex-wrap items-center gap-2"
    >
      <Button variant="outline" size="sm" onClick={() => abrir("rechazar")}>
        <ShieldX data-icon="inline-start" aria-hidden />
        Rechazar
      </Button>
      <Button size="sm" onClick={() => abrir("aprobar")}>
        <CircleCheck data-icon="inline-start" aria-hidden />
        Aprobar evidencia
      </Button>
      <DialogoAprobarEvidencia
        abierto={dialogo === "aprobar"}
        onAbiertoChange={cerrar}
        publicacion={publicacion}
        enviadaAt={versionVista}
        focoAlCerrar={foco.focoAlCerrar}
        onAprobada={foco.anotar}
        onFallo={refresco.revisar}
      />
      <DialogoMotivo
        abierto={dialogo === "rechazar"}
        onAbiertoChange={cerrar}
        destructivo
        titulo="¿Rechazar la evidencia?"
        descripcion={
          <>
            {medio ? <strong>{medio}</strong> : "El medio"} recibe un aviso con
            tus observaciones y un plazo para cargar una evidencia nueva.{" "}
            {TEXTO_VUELVE_TRAS_RECHAZO_EVIDENCIA}
          </>
        }
        etiqueta="Observaciones para el medio"
        placeholder="Ej.: falta la etiqueta de publicidad en la publicación…"
        ayuda="El medio las verá tal cual; quedan en la bitácora."
        sugerencias={SUGERENCIAS_RECHAZO_EVIDENCIA}
        textoConfirmar="Rechazar evidencia"
        focoAlCerrar={foco.focoAlCerrar}
        onConfirmar={async (observaciones) => {
          const resultado = await validarEvidencia({
            aprobar: false,
            publicacionId: publicacion.id,
            observaciones,
            enviadaAt: versionVista,
          })
          refresco.revisar(resultado)
          if (resultado.ok) {
            foco.anotar()
            const plazo = resultado.datos.fechaLimitePublicacion
            toast.success("Evidencia rechazada", {
              description: plazo
                ? `El medio puede cargar otra hasta el ${cerrarFrase(formatearFechaHoraFija(plazo))}`
                : undefined,
            })
          }
          return resultado
        }}
      />
    </div>
  )
}

// ── Corte de métricas ────────────────────────────────────────────────────────

/**
 * Aprobar, rechazar o corregir un corte desde la ficha (ADM-008). Aprobar uno
 * con alerta —hoy o antes de que el medio lo corrigiera— pide anotar qué se
 * revisó (con sus razones a la vista); uno sin alerta, solo confirmar. Si el
 * rechazo espera a la disputa (`rechazoEnDisputa`), solo se ofrece aprobar.
 * «Corregir» (métrica aprobada) lo abre quien monta este control, que tiene
 * la captura firmada. Se decide sobre las cifras que mostraba la ficha al
 * abrir el diálogo: si el medio las cambió mientras tanto, la BD no decide y,
 * al cerrar, la ficha muestra las nuevas.
 */
export function DecisionCorte({
  corte,
  plataforma,
  acciones,
  idBloqueo,
  onCorregir,
}: {
  corte: CorteMetrica
  plataforma: Plataforma
  acciones: AccionesCorte
  /** Id del texto que explica el bloqueo de «Aprobar» (si lo hay). */
  idBloqueo?: string
  onCorregir: () => void
}) {
  const [dialogo, setDialogo] = useState<"aprobar" | "rechazar" | null>(null)
  // La versión que se ve al abrir: un refresco con el diálogo abierto no la cambia.
  const [versionVista, setVersionVista] = useState(corte.actualizadaAt)
  const foco = useFocoTrasDecision(porId(idCorte(corte.id)))
  const refresco = useRefrescoTrasFallo("rechazoMetrica", "metrica", foco)
  const nombre = CORTES[corte.corte].etiqueta
  const conAlerta = alertaRevisable(corte.alerta)
  const motivos = conAlerta ? frasesAlerta(corte.alerta, plataforma) : []

  function abrir(tipo: "aprobar" | "rechazar") {
    foco.reiniciar()
    setVersionVista(corte.actualizadaAt)
    setDialogo(tipo)
  }

  function cerrar(abierto: boolean) {
    if (abierto) return
    setDialogo(null)
    refresco.alCerrar()
  }

  async function aprobar(observaciones: string) {
    const resultado = await validarMetrica({
      aprobar: true,
      metricaId: corte.id,
      conAlerta,
      observaciones,
      enviadaAt: versionVista,
    })
    refresco.revisar(resultado)
    if (resultado.ok) {
      foco.anotar()
      toast.success(`Métricas de ${nombre} aprobadas`)
    }
    return resultado
  }

  if (!acciones.validar && !acciones.corregir) return null

  return (
    <div
      role="group"
      aria-label={`Validar las métricas de ${nombre}`}
      className="flex flex-wrap items-center gap-2"
    >
      {acciones.validar ? (
        <>
          {acciones.rechazoEnDisputa ? null : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => abrir("rechazar")}
            >
              <ShieldX data-icon="inline-start" aria-hidden />
              Rechazar
            </Button>
          )}
          <Button
            size="sm"
            disabled={acciones.bloqueoAprobar !== null}
            aria-describedby={acciones.bloqueoAprobar ? idBloqueo : undefined}
            onClick={() => abrir("aprobar")}
          >
            <CircleCheck data-icon="inline-start" aria-hidden />
            Aprobar
          </Button>
        </>
      ) : null}
      {acciones.corregir ? (
        <Button variant="outline" size="sm" onClick={onCorregir}>
          <PencilLine data-icon="inline-start" aria-hidden />
          Corregir
        </Button>
      ) : null}

      {conAlerta ? (
        <DialogoMotivo
          abierto={dialogo === "aprobar"}
          onAbiertoChange={cerrar}
          titulo={`¿Aprobar las métricas de ${nombre} con alerta?`}
          descripcion={
            <>
              {motivos.join(" ")} Anota qué revisaste: queda como constancia en
              la bitácora.
            </>
          }
          etiqueta="Qué revisaste"
          placeholder="Ej.: comparé el alcance con la captura y coincide…"
          ayuda="Obligatorio para aprobar una métrica con alerta."
          sugerencias={SUGERENCIAS_REVISION_ALERTA}
          textoConfirmar="Aprobar"
          focoAlCerrar={foco.focoAlCerrar}
          onConfirmar={aprobar}
        />
      ) : (
        <DialogoConfirmacion
          abierto={dialogo === "aprobar"}
          onAbiertoChange={cerrar}
          titulo={`¿Aprobar las métricas de ${nombre}?`}
          descripcion="Confirma que las cifras coinciden con la captura del panel. El anunciante las verá en el seguimiento de su campaña."
          textoConfirmar="Aprobar"
          focoAlCerrar={foco.focoAlCerrar}
          onConfirmar={() => aprobar("")}
        />
      )}
      <DialogoMotivo
        abierto={dialogo === "rechazar"}
        onAbiertoChange={cerrar}
        destructivo
        titulo={`¿Rechazar las métricas de ${nombre}?`}
        descripcion="El medio recibe un aviso con tus observaciones para corregir las cifras de este corte."
        etiqueta="Observaciones para el medio"
        placeholder="Ej.: el alcance no coincide con la captura del panel…"
        ayuda="El medio las verá tal cual; quedan en la bitácora."
        sugerencias={SUGERENCIAS_RECHAZO_METRICA}
        textoConfirmar="Rechazar"
        focoAlCerrar={foco.focoAlCerrar}
        onConfirmar={async (observaciones) => {
          const resultado = await validarMetrica({
            aprobar: false,
            metricaId: corte.id,
            observaciones,
            enviadaAt: versionVista,
          })
          refresco.revisar(resultado)
          if (resultado.ok) {
            foco.anotar()
            toast.success(`Métricas de ${nombre} rechazadas`, {
              description: "El medio recibió tus observaciones.",
            })
          }
          return resultado
        }}
      />
    </div>
  )
}
