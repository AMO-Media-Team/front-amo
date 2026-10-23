"use client"

import { Archive, Ban, Pencil, Send, Undo2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { rutaAsistente } from "@/features/asistente-oferta/rutas"
import { DialogoMotivo } from "@/features/usuarios/components/dialogo-motivo"
import type { ResultadoAccion } from "@/lib/result"

import type { AccionAnunciante, OpcionAnunciante } from "../acciones"
import {
  archivarOferta,
  cancelarOferta,
  retirarOfertaDeRevision,
} from "../actions"
import { useFocoTrasCambio } from "./use-foco-tras-cambio"
import { SUGERENCIAS_CANCELACION_ANUNCIANTE } from "../presentacion"
import { rutaOfertasDeCampana } from "../rutas"
import { DialogoEnvio } from "./dialogo-envio"

type Dialogo = "enviar" | "retirar" | "cancelar" | "archivar" | null

/** Una acción que el estado admite pero todavía no se puede: se explica, sin confirmar. */
function DialogoBloqueado({
  abierto,
  onAbiertoChange,
  titulo,
  explicacion,
}: {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  titulo: string
  explicacion: string
}) {
  return (
    <AlertDialog open={abierto} onOpenChange={onAbiertoChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-warning/12 text-warning">
            <Ban aria-hidden />
          </AlertDialogMedia>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{explicacion}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button onClick={() => onAbiertoChange(false)}>Entendido</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Acciones del anunciante sobre su oferta según su estado (las calcula el
 * servidor con `accionesAnunciante`): editarla en el asistente, enviarla o
 * reenviarla a revisión, retirarla de revisión, cancelarla y archivarla
 * (cancelada o terminada; archivada, se vuelve a la campaña). La BD decide;
 * un fallo se muestra dentro de su diálogo. Tras un cambio de estado el
 * botón que abrió el diálogo desaparece: el foco va al aviso del estado.
 */
export function AccionesOferta({
  ofertaId,
  campanaId,
  titulo,
  opciones,
}: {
  ofertaId: string
  campanaId: string
  titulo: string
  opciones: readonly OpcionAnunciante[]
}) {
  const router = useRouter()
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const foco = useFocoTrasCambio()
  const opcion = (accion: AccionAnunciante) =>
    opciones.find((candidata) => candidata.accion === accion)

  const envio = opcion("enviar") ?? opcion("reenviar")
  const cancelacion = opcion("cancelar")
  const archivo = opcion("archivar")
  if (opciones.length === 0) return null

  function abrir(nuevo: Dialogo) {
    foco.reiniciar()
    setDialogo(nuevo)
  }

  function cerrar(abierto: boolean) {
    if (!abierto) setDialogo(null)
  }

  async function conAviso(
    resultado: Promise<ResultadoAccion>,
    mensaje: string
  ): Promise<ResultadoAccion> {
    const respuesta = foco.anotar(await resultado)
    if (respuesta.ok) toast.success(mensaje, { description: titulo })
    return respuesta
  }

  return (
    <div className="flex flex-wrap gap-2 lg:justify-end">
      {envio ? (
        <Button
          size="lg"
          className="max-sm:flex-1"
          onClick={() => abrir("enviar")}
        >
          <Send data-icon="inline-start" aria-hidden />
          {envio.accion === "reenviar"
            ? "Reenviar a revisión"
            : "Enviar a revisión"}
        </Button>
      ) : null}
      {opcion("editar") ? (
        <EnlaceBoton
          href={rutaAsistente(campanaId, ofertaId)}
          variant="outline"
          size="lg"
          className="max-sm:flex-1"
        >
          <Pencil data-icon="inline-start" aria-hidden />
          Editar
        </EnlaceBoton>
      ) : null}
      {opcion("retirar") ? (
        <Button
          variant="outline"
          size="lg"
          className="max-sm:flex-1"
          onClick={() => abrir("retirar")}
        >
          <Undo2 data-icon="inline-start" aria-hidden />
          Retirar de revisión
        </Button>
      ) : null}
      {cancelacion ? (
        <Button
          variant="destructive"
          size="lg"
          className="max-sm:flex-1"
          onClick={() => abrir("cancelar")}
        >
          <Ban data-icon="inline-start" aria-hidden />
          Cancelar oferta
        </Button>
      ) : null}
      {archivo ? (
        <Button
          variant="outline"
          size="lg"
          className="max-sm:flex-1"
          onClick={() => abrir("archivar")}
        >
          <Archive data-icon="inline-start" aria-hidden />
          Archivar oferta
        </Button>
      ) : null}

      {envio ? (
        <DialogoEnvio
          abierto={dialogo === "enviar"}
          onAbiertoChange={cerrar}
          ofertaId={ofertaId}
          campanaId={campanaId}
          reenvio={envio.accion === "reenviar"}
          foco={foco}
        />
      ) : null}

      <DialogoConfirmacion
        abierto={dialogo === "retirar"}
        onAbiertoChange={cerrar}
        titulo="¿Retirar la oferta de revisión?"
        descripcion="Vuelve a borrador para que la ajustes. Cuando esté lista, envíala de nuevo: la revisión empieza otra vez."
        textoConfirmar="Retirar de revisión"
        focoAlCerrar={foco.focoAlCerrar}
        onConfirmar={() =>
          conAviso(
            retirarOfertaDeRevision({ ofertaId }),
            "La oferta volvió a borrador"
          )
        }
      />

      {cancelacion?.bloqueo ? (
        <DialogoBloqueado
          abierto={dialogo === "cancelar"}
          onAbiertoChange={cerrar}
          titulo="No se puede cancelar la oferta"
          explicacion={cancelacion.bloqueo}
        />
      ) : cancelacion?.requiereMotivo ? (
        <DialogoMotivo
          abierto={dialogo === "cancelar"}
          onAbiertoChange={cerrar}
          titulo="¿Cancelar la oferta publicada?"
          descripcion="Deja de estar disponible en el marketplace y los medios ya no podrán tomar cupos. No se puede deshacer."
          textoConfirmar="Sí, cancelar la oferta"
          textoCancelar="Volver"
          destructivo
          ayuda="Queda en el historial de la oferta y en la bitácora."
          placeholder="Ej.: la campaña cambió de estrategia…"
          sugerencias={SUGERENCIAS_CANCELACION_ANUNCIANTE}
          focoAlCerrar={foco.focoAlCerrar}
          onConfirmar={(motivo) =>
            conAviso(cancelarOferta({ ofertaId, motivo }), "Oferta cancelada")
          }
        />
      ) : cancelacion ? (
        <DialogoConfirmacion
          abierto={dialogo === "cancelar"}
          onAbiertoChange={cerrar}
          titulo="¿Cancelar la oferta?"
          descripcion="Se descarta y no podrás enviarla a revisión. No se puede deshacer."
          textoConfirmar="Cancelar oferta"
          textoCancelar="Volver"
          destructivo
          focoAlCerrar={foco.focoAlCerrar}
          onConfirmar={() =>
            conAviso(cancelarOferta({ ofertaId }), "Oferta cancelada")
          }
        />
      ) : null}

      {archivo ? (
        <DialogoConfirmacion
          abierto={dialogo === "archivar"}
          onAbiertoChange={cerrar}
          titulo="¿Archivar la oferta?"
          descripcion="Deja de verse en la campaña; el equipo AMO conserva su historial. No se puede deshacer."
          textoConfirmar="Archivar oferta"
          textoCancelar="Conservar"
          destructivo
          onConfirmar={async () => {
            const respuesta = await conAviso(
              archivarOferta({ ofertaId }),
              "Oferta archivada"
            )
            // La ficha ya no existe: de vuelta a la campaña, sin dejarla en el historial.
            if (respuesta.ok) router.replace(rutaOfertasDeCampana(campanaId))
            return respuesta
          }}
        />
      ) : null}
    </div>
  )
}
