"use client"

import { Ban, Lock, Scale } from "lucide-react"
import { useRouter } from "next/navigation"
import { Fragment, type ReactNode, useId, useRef, useState } from "react"
import { toast } from "sonner"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { PieAcciones } from "@/components/layout/pie-acciones"
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
import { rutaDisputaInterna } from "@/features/disputas/rutas"
import type { MotivoDisputa } from "@/features/disputas/tipos"

import { CAUSAS_CANCELACION, type EstadoAsignacion } from "../estados"
import { avisoEstadoAsignacion } from "../foco"
import type { OpcionesGestion } from "../gestion-asignacion"
import { rutaMedio } from "../rutas"
import {
  type CancelacionHecha,
  DialogoCancelarAsignacion,
} from "./dialogo-cancelar-asignacion"
import { DialogoAbrirDisputa } from "./dialogo-abrir-disputa"

type Dialogo = "cancelar" | "bloqueo" | "disputa" | null

export interface AsignacionGestionable {
  id: string
  /** Título de la oferta (nombra la asignación en diálogos y avisos). */
  titulo: string
  estado: EstadoAsignacion
  medio: { id: string; nombre: string }
}

export interface AccionesAsignacionProps {
  asignacion: AsignacionGestionable
  gestion: OpcionesGestion
  /**
   * `cabecera`: los botones sueltos, para el hueco de acciones de la cabecera
   * (desde `sm`). `pie`: el pie fijo del celular (`PieAcciones`), con
   * `verificar` delante.
   */
  disposicion: "cabecera" | "pie"
  /** «Verificar» (`VerificarAsignacion` de la validación), solo en el pie. */
  verificar?: ReactNode
  /** Fichas que el rol puede abrir desde los avisos (`medios.ver`, `disputas.ver`). */
  enlaces: { medio: boolean; disputas: boolean }
}

/** Explica por qué no se puede cancelar ahora (el botón sigue enfocable). */
function DialogoBloqueo({
  abierto,
  onAbiertoChange,
  explicacion,
  disputaId,
}: {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  explicacion: string
  /** En disputa: el enlace para resolverla. */
  disputaId: string | null
}) {
  return (
    <AlertDialog open={abierto} onOpenChange={onAbiertoChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-warning/12 text-warning">
            <Lock aria-hidden />
          </AlertDialogMedia>
          <AlertDialogTitle>No se puede cancelar ahora</AlertDialogTitle>
          <AlertDialogDescription>{explicacion}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {disputaId ? (
            <EnlaceBoton
              href={rutaDisputaInterna(disputaId)}
              variant="outline"
              onClick={() => onAbiertoChange(false)}
            >
              <Scale data-icon="inline-start" aria-hidden />
              Ver la disputa
            </EnlaceBoton>
          ) : null}
          <Button onClick={() => onAbiertoChange(false)}>Entendido</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Gestión de la asignación por el equipo AMO (ADM-010, ADM-011) según lo que
 * calculó el servidor (`opcionesGestion`): «Abrir disputa» o «Ver la
 * disputa» y «Cancelar asignación» (con su bloqueo explicado si está
 * liquidada o en disputa). La página la monta dos veces —en la cabecera desde
 * `sm` y en el pie fijo del celular— y cada una sigue montada aunque ya no
 * haya botones: así el diálogo abierto se cierra con normalidad cuando la
 * acción refresca la ficha. Tras un cambio de estado el botón que abrió el
 * diálogo desaparece y el foco va al aviso del estado.
 */
export function AccionesAsignacion({
  asignacion,
  gestion,
  disposicion,
  verificar,
  enlaces,
}: AccionesAsignacionProps) {
  const router = useRouter()
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  // Lo que mostraba la ficha al abrir: la acción no cancela si cambió.
  const [estadoVisto, setEstadoVisto] = useState(asignacion.estado)
  // Las opciones con que se abrió el diálogo, por si el refresco las retira.
  const [cancelacion, setCancelacion] = useState(gestion.cancelar)
  const [motivosDisputa, setMotivosDisputa] = useState<
    readonly MotivoDisputa[]
  >(() => (gestion.disputa?.tipo === "abrir" ? gestion.disputa.motivos : []))
  const cambio = useRef(false)
  const idBloqueo = useId()
  const { cancelar, disputa } = gestion
  const resumen = {
    id: asignacion.id,
    titulo: asignacion.titulo,
    medio: asignacion.medio.nombre,
  }

  function abrir(nuevo: Exclude<Dialogo, null>) {
    cambio.current = false
    setEstadoVisto(asignacion.estado)
    setCancelacion(gestion.cancelar)
    if (gestion.disputa?.tipo === "abrir") {
      setMotivosDisputa(gestion.disputa.motivos)
    }
    setDialogo(nuevo)
  }

  function cerrar(abierto: boolean) {
    if (!abierto) setDialogo(null)
  }

  const focoAlCerrar = () => (cambio.current ? avisoEstadoAsignacion() : null)

  function alCancelar({ causa, medioSuspendido }: CancelacionHecha) {
    cambio.current = true
    const etiqueta = CAUSAS_CANCELACION[causa]
    toast.success("Asignación cancelada", {
      description: medioSuspendido
        ? `${etiqueta} · ${asignacion.medio.nombre} quedó suspendido.`
        : `${etiqueta} · ${asignacion.titulo}`,
      action:
        medioSuspendido && enlaces.medio
          ? {
              label: "Ver el medio",
              onClick: () => router.push(rutaMedio(asignacion.medio.id)),
            }
          : undefined,
    })
  }

  function alAbrirDisputa(disputaId: string) {
    cambio.current = true
    toast.success("Disputa abierta", {
      description: asignacion.titulo,
      action: enlaces.disputas
        ? {
            label: "Ver la disputa",
            onClick: () => router.push(rutaDisputaInterna(disputaId)),
          }
        : undefined,
    })
  }

  const botones: ReactNode[] = []
  if (disputa?.tipo === "abrir") {
    botones.push(
      <Button
        key="disputa"
        variant="outline"
        size="lg"
        onClick={() => abrir("disputa")}
      >
        <Scale data-icon="inline-start" aria-hidden />
        Abrir disputa
      </Button>
    )
  } else if (disputa?.tipo === "ver") {
    botones.push(
      <EnlaceBoton
        key="disputa"
        href={rutaDisputaInterna(disputa.disputaId)}
        variant="outline"
        size="lg"
      >
        <Scale data-icon="inline-start" aria-hidden />
        Ver la disputa
      </EnlaceBoton>
    )
  }
  if (cancelar) {
    botones.push(
      cancelar.bloqueo ? (
        // El porqué va fuera del botón: dentro sumaría su texto al nombre.
        <Fragment key="cancelar">
          <Button
            variant="outline"
            size="lg"
            aria-describedby={idBloqueo}
            onClick={() => abrir("bloqueo")}
          >
            <Lock data-icon="inline-start" aria-hidden />
            Cancelar asignación
          </Button>
          <span id={idBloqueo} className="sr-only">
            {cancelar.bloqueo}
          </span>
        </Fragment>
      ) : (
        <Button
          key="cancelar"
          variant="destructive"
          size="lg"
          onClick={() => abrir("cancelar")}
        >
          <Ban data-icon="inline-start" aria-hidden />
          Cancelar asignación
        </Button>
      )
    )
  }

  const dialogos = (
    <>
      {cancelacion ? (
        <DialogoCancelarAsignacion
          abierto={dialogo === "cancelar"}
          onAbiertoChange={cerrar}
          asignacion={resumen}
          estadoVisto={estadoVisto}
          opcion={cancelacion}
          focoAlCerrar={focoAlCerrar}
          onCancelada={alCancelar}
        />
      ) : null}
      {cancelacion?.bloqueo ? (
        <DialogoBloqueo
          abierto={dialogo === "bloqueo"}
          onAbiertoChange={cerrar}
          explicacion={cancelacion.bloqueo}
          disputaId={disputa?.tipo === "ver" ? disputa.disputaId : null}
        />
      ) : null}
      <DialogoAbrirDisputa
        abierto={dialogo === "disputa"}
        onAbiertoChange={cerrar}
        asignacion={resumen}
        motivos={motivosDisputa}
        focoAlCerrar={focoAlCerrar}
        onAbierta={alAbrirDisputa}
      />
    </>
  )

  if (disposicion === "cabecera") {
    return (
      <>
        {botones}
        {dialogos}
      </>
    )
  }

  const conAcciones = botones.length > 0 || Boolean(verificar)
  return (
    <>
      {conAcciones ? (
        // `contents`: el pie sigue siendo hijo directo de la página (su `sticky`
        // necesita todo el alto); desde `sm` las acciones van en la cabecera.
        <div className="contents sm:hidden">
          <PieAcciones etiqueta="Acciones de la asignación">
            <div className="flex w-full flex-wrap gap-1.5 *:flex-auto">
              {verificar}
              {botones}
            </div>
          </PieAcciones>
        </div>
      ) : null}
      {dialogos}
    </>
  )
}
