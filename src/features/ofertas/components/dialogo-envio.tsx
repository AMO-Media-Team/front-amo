"use client"

import { ArrowRight, CircleAlert, Send, Tag } from "lucide-react"
import { useId, useState, useTransition } from "react"
import { toast } from "sonner"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
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
import { Spinner } from "@/components/ui/spinner"
import {
  type PasoOferta,
  TITULOS_PASO,
} from "@/features/asistente-oferta/pasos"
import {
  esAsistido,
  GESTION_PROPIA,
  type ModoGestion,
  rutasGestion,
} from "@/features/campanas/rutas-gestion"

import { enviarOfertaARevision } from "../actions"
import type { FocoTrasCambio } from "./use-foco-tras-cambio"
import { pasoCorregible, tituloFaltaPaso } from "../presentacion"

interface FalloEnvio {
  mensaje: string
  paso: PasoOferta | null
}

const ERROR_INESPERADO = "No se pudo enviar la oferta. Intenta de nuevo."

/**
 * Confirmación del envío (o reenvío) a revisión. Si la BD lo rechaza, el
 * diálogo sigue abierto con «Falta completar: <paso>», el detalle de qué
 * corregir y un enlace a ese paso del asistente. Enviada, el botón que lo
 * abrió desaparece: el foco va al aviso del estado (`foco`). En la gestión
 * asistida (ADM-014) habla de la cola de moderación y del aviso a la empresa.
 */
export function DialogoEnvio({
  abierto,
  onAbiertoChange,
  ofertaId,
  campanaId,
  reenvio,
  foco,
  gestion = GESTION_PROPIA,
}: {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  ofertaId: string
  campanaId: string
  /** La oferta estaba devuelta: se reenvía tras atender los comentarios. */
  reenvio: boolean
  /** Foco tras el cambio de estado (`useFocoTrasCambio` de las acciones). */
  foco: FocoTrasCambio
  gestion?: ModoGestion
}) {
  const asistido = esAsistido(gestion)
  const rutas = rutasGestion(gestion)
  const [falla, setFalla] = useState<FalloEnvio | null>(null)
  const [pendiente, iniciar] = useTransition()
  const idFalla = useId()

  function cambiarAbierto(valor: boolean) {
    if (pendiente) return
    if (!valor) setFalla(null)
    onAbiertoChange(valor)
  }

  function enviar() {
    setFalla(null)
    iniciar(async () => {
      try {
        const resultado = foco.anotar(await enviarOfertaARevision({ ofertaId }))
        if (resultado.ok) {
          toast.success(
            reenvio
              ? "Oferta reenviada a revisión"
              : "Oferta enviada a revisión",
            {
              description: asistido
                ? "Queda en la cola de moderación."
                : "Te avisaremos cuando el equipo AMO la revise.",
            }
          )
          onAbiertoChange(false)
          return
        }
        setFalla({ mensaje: resultado.error, paso: resultado.paso })
      } catch {
        setFalla({ mensaje: ERROR_INESPERADO, paso: null })
      }
    })
  }

  const accion = reenvio ? "Reenviar a revisión" : "Enviar a revisión"

  return (
    <AlertDialog open={abierto} onOpenChange={cambiarAbierto}>
      <AlertDialogContent
        className="sm:max-w-md"
        finalFocus={foco.focoAlCerrar}
      >
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-primary/10 text-primary">
            <Send aria-hidden />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {reenvio
              ? "¿Reenviar la oferta a revisión?"
              : "¿Enviar la oferta a revisión?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {esAsistido(gestion)
              ? `Queda en la cola de moderación y ${gestion.anunciante} recibe un aviso. Mientras esté en revisión no se edita; si hay que cambiar algo, retírala de revisión.`
              : "El equipo AMO revisará que cumpla las condiciones de publicación y te avisará. Mientras esté en revisión no podrás editarla; si necesitas cambiar algo, retírala de revisión."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <p className="flex gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-pretty text-muted-foreground">
          <Tag aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
          La etiqueta de publicidad es obligatoria en cada publicación: los
          medios la verán como condición de la oferta.
        </p>

        {falla ? (
          <div
            id={idFalla}
            role="alert"
            className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/8 p-3 text-sm"
          >
            <p className="flex items-start gap-2 font-medium text-destructive">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {tituloFaltaPaso(falla.paso)}
            </p>
            <p className="text-pretty">{falla.mensaje}</p>
            {pasoCorregible(falla.paso) ? (
              <EnlaceBoton
                href={rutas.pasoAsistente(campanaId, ofertaId, falla.paso)}
                variant="outline"
                size="lg"
                className="w-full sm:w-fit"
              >
                Ir a «{TITULOS_PASO[falla.paso]}»
                <ArrowRight data-icon="inline-end" aria-hidden />
              </EnlaceBoton>
            ) : null}
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pendiente}>Cancelar</AlertDialogCancel>
          <Button
            onClick={enviar}
            disabled={pendiente}
            aria-describedby={falla ? idFalla : undefined}
          >
            {pendiente ? (
              <Spinner aria-label="Enviando" data-icon="inline-start" />
            ) : null}
            {accion}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
