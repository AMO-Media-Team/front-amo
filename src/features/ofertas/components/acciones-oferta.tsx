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
import {
  esAsistido,
  GESTION_PROPIA,
  type ModoGestion,
  rutasGestion,
} from "@/features/campanas/rutas-gestion"
import type { EstadoOferta } from "@/features/operacion/estados"
import { DialogoMotivo } from "@/features/usuarios/components/dialogo-motivo"
import type { ResultadoAccion } from "@/lib/result"
import { cn } from "@/lib/utils"

import type { AccionGestion, OpcionGestion } from "../acciones"
import {
  archivarOferta,
  cancelarOferta,
  retirarOfertaDeRevision,
} from "../actions"
import { useFocoTrasCambio } from "./use-foco-tras-cambio"
import {
  SUGERENCIAS_CANCELACION_ANUNCIANTE,
  SUGERENCIAS_CANCELACION_ASISTIDA,
} from "../presentacion"
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

/** Textos de la cancelación según el estado de la oferta y quién la cancela. */
function textosCancelacion(estado: EstadoOferta, gestion: ModoGestion) {
  const publicada = estado === "PUBLICADA"
  if (esAsistido(gestion)) {
    return {
      titulo: publicada
        ? "¿Cancelar la oferta publicada?"
        : "¿Cancelar la oferta?",
      descripcion: publicada
        ? `Deja de estar disponible en el marketplace, los medios ya no podrán tomar cupos y ${gestion.anunciante} recibe un aviso con el motivo. No se puede deshacer.`
        : `Se descarta por cuenta de ${gestion.anunciante}, que recibe un aviso con el motivo, y ya no se podrá enviar a revisión. No se puede deshacer.`,
      ayuda:
        "Lo recibe la empresa en el aviso; queda en el historial de la oferta y en la bitácora.",
      sugerencias: SUGERENCIAS_CANCELACION_ASISTIDA,
    }
  }
  return {
    titulo: publicada
      ? "¿Cancelar la oferta publicada?"
      : "¿Cancelar la oferta?",
    descripcion: publicada
      ? "Deja de estar disponible en el marketplace y los medios ya no podrán tomar cupos. No se puede deshacer."
      : "Se descarta y no podrás enviarla a revisión. No se puede deshacer.",
    ayuda: "Queda en el historial de la oferta y en la bitácora.",
    sugerencias: SUGERENCIAS_CANCELACION_ANUNCIANTE,
  }
}

/**
 * Acciones sobre la oferta según su estado (las calcula el servidor con
 * `accionesGestion`): editarla en el asistente, enviarla o reenviarla a
 * revisión, retirarla de revisión, cancelarla y archivarla (cancelada o
 * terminada; archivada, se vuelve a la campaña). Las usa el anunciante en su
 * ficha y el equipo AMO en el panel de gestión asistida de la ficha interna
 * (`gestion`, ADM-014: enlaces de Operación, textos que hablan de la empresa
 * y botones apilados con `disposicion="columna"`). La BD decide; un fallo se
 * muestra dentro de su diálogo. Tras un cambio de estado el botón que abrió
 * el diálogo desaparece: el foco va al aviso del estado.
 */
export function AccionesOferta({
  ofertaId,
  campanaId,
  titulo,
  estado,
  opciones,
  gestion = GESTION_PROPIA,
  disposicion = "fila",
}: {
  ofertaId: string
  campanaId: string
  titulo: string
  estado: EstadoOferta
  opciones: readonly OpcionGestion[]
  gestion?: ModoGestion
  disposicion?: "fila" | "columna"
}) {
  const router = useRouter()
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const foco = useFocoTrasCambio()
  const rutas = rutasGestion(gestion)
  const asistido = esAsistido(gestion)
  const columna = disposicion === "columna"
  const boton = columna ? "w-full" : "max-sm:flex-1"
  const opcion = (accion: AccionGestion) =>
    opciones.find((candidata) => candidata.accion === accion)

  const envio = opcion("enviar") ?? opcion("reenviar")
  const cancelacion = opcion("cancelar")
  const archivo = opcion("archivar")
  const textosCancelar = textosCancelacion(estado, gestion)
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
    <div
      className={cn(
        columna ? "grid gap-2" : "flex flex-wrap gap-2 lg:justify-end"
      )}
    >
      {envio ? (
        <Button size="lg" className={boton} onClick={() => abrir("enviar")}>
          <Send data-icon="inline-start" aria-hidden />
          {envio.accion === "reenviar"
            ? "Reenviar a revisión"
            : "Enviar a revisión"}
        </Button>
      ) : null}
      {opcion("editar") ? (
        <EnlaceBoton
          href={rutas.asistente(campanaId, ofertaId)}
          variant="outline"
          size="lg"
          className={boton}
        >
          <Pencil data-icon="inline-start" aria-hidden />
          Editar
        </EnlaceBoton>
      ) : null}
      {opcion("retirar") ? (
        <Button
          variant="outline"
          size="lg"
          className={boton}
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
          className={boton}
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
          className={boton}
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
          gestion={gestion}
        />
      ) : null}

      <DialogoConfirmacion
        abierto={dialogo === "retirar"}
        onAbiertoChange={cerrar}
        titulo="¿Retirar la oferta de revisión?"
        descripcion={
          asistido
            ? `Vuelve a borrador para ajustarla y ${gestion.anunciante} recibe un aviso. Cuando esté lista, envíala de nuevo: la revisión empieza otra vez.`
            : "Vuelve a borrador para que la ajustes. Cuando esté lista, envíala de nuevo: la revisión empieza otra vez."
        }
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
          titulo={textosCancelar.titulo}
          descripcion={textosCancelar.descripcion}
          textoConfirmar="Sí, cancelar la oferta"
          textoCancelar="Volver"
          destructivo
          ayuda={textosCancelar.ayuda}
          placeholder={
            asistido
              ? "Ej.: lo solicitó la empresa por correo…"
              : "Ej.: la campaña cambió de estrategia…"
          }
          sugerencias={textosCancelar.sugerencias}
          focoAlCerrar={foco.focoAlCerrar}
          onConfirmar={(motivo) =>
            conAviso(cancelarOferta({ ofertaId, motivo }), "Oferta cancelada")
          }
        />
      ) : cancelacion ? (
        <DialogoConfirmacion
          abierto={dialogo === "cancelar"}
          onAbiertoChange={cerrar}
          titulo={textosCancelar.titulo}
          descripcion={textosCancelar.descripcion}
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
          descripcion={
            asistido
              ? `Deja de verse en la campaña, también para ${gestion.anunciante}; su historial se conserva. Archivar no le llega como aviso a la empresa. No se puede deshacer.`
              : "Deja de verse en la campaña; el equipo AMO conserva su historial. No se puede deshacer."
          }
          textoConfirmar="Archivar oferta"
          textoCancelar="Conservar"
          destructivo
          onConfirmar={async () => {
            const respuesta = await conAviso(
              archivarOferta({ ofertaId }),
              "Oferta archivada"
            )
            // La ficha ya no existe: de vuelta a la campaña, sin dejarla en el historial.
            if (respuesta.ok) router.replace(rutas.ofertasCampana(campanaId))
            return respuesta
          }}
        />
      ) : null}
    </div>
  )
}
