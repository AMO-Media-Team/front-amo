"use client"

import {
  Ban,
  CircleCheck,
  ClipboardCheck,
  type LucideIcon,
  Megaphone,
  MessageSquareWarning,
  ShieldX,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useState } from "react"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { Button } from "@/components/ui/button"
import { useFocoTrasCambio } from "@/features/ofertas/components/use-foco-tras-cambio"
import type { EstadoOferta } from "@/features/operacion/estados"
import { DialogoMotivo } from "@/features/usuarios/components/dialogo-motivo"
import { TarjetaFicha } from "@/features/usuarios/components/tarjeta-ficha"
import type { ResultadoAccion } from "@/lib/result"

import {
  cancelarOfertaPublicada,
  devolverOferta,
  publicarOferta,
  rechazarOferta,
} from "../actions"
import { RUTA_MODERACION } from "../cola"
import {
  type Decision,
  type OpcionDecision,
  SUGERENCIAS_CANCELACION,
  SUGERENCIAS_DEVOLUCION,
  SUGERENCIAS_RECHAZO,
} from "../decision"

/** Qué revisar antes de decidir (ADM-005: vista completa). */
const COMPROBACIONES: readonly string[] = [
  "El creativo cumple el formato y muestra la etiqueta de publicidad.",
  "El copy sugerido y las menciones son adecuados para la audiencia.",
  "El enlace de destino es seguro (https) y funciona.",
  "Las fechas dan tiempo a los medios para aceptar y publicar.",
  "La segmentación, los cupos y el presupuesto son coherentes.",
]

const TEXTOS: Readonly<Record<Decision, { boton: string; aviso: string }>> = {
  publicar: { boton: "Publicar", aviso: "Oferta publicada" },
  devolver: { boton: "Devolver", aviso: "Oferta devuelta al anunciante" },
  rechazar: { boton: "Rechazar", aviso: "Oferta rechazada" },
  cancelar: { boton: "Cancelar oferta", aviso: "Oferta cancelada" },
}

function BotonDecision({
  opcion,
  variante,
  icono: Icono,
  idBloqueos,
  onAbrir,
}: {
  opcion: OpcionDecision | undefined
  variante: "default" | "outline" | "destructive"
  icono: LucideIcon
  idBloqueos: string
  onAbrir: (decision: Decision) => void
}) {
  if (!opcion) return null
  return (
    <Button
      size="lg"
      variant={variante}
      disabled={opcion.bloqueo !== null}
      aria-describedby={opcion.bloqueo ? idBloqueos : undefined}
      onClick={() => onAbrir(opcion.decision)}
      className="w-full"
    >
      <Icono data-icon="inline-start" aria-hidden />
      {TEXTOS[opcion.decision].boton}
    </Button>
  )
}

/**
 * Decisión de moderación sobre la oferta (ADM-005): publicar, devolver con
 * comentario, rechazar con motivo o cancelar la publicada, según lo que
 * permiten su estado y el rol (`decisionesDisponibles`, calculadas en el
 * servidor). Lo bloqueado se explica junto al botón; la BD vuelve a
 * comprobarlo y un fallo se muestra dentro del diálogo.
 *
 * Publicar, devolver y rechazar deciden sobre el envío que mostraba la ficha
 * al abrir el diálogo (`enviadaAt`): si el anunciante la reenvió mientras
 * tanto, la BD lo rechaza, la acción refresca la ficha y el diálogo lo
 * explica; reintentar desde el mismo diálogo sigue rechazándose hasta
 * cerrarlo y revisar lo nuevo. Tras decidir, el panel cambia o desaparece y
 * el foco va al aviso del estado.
 */
export function DecisionModeracion({
  oferta,
  opciones,
}: {
  oferta: {
    id: string
    titulo: string
    estado: EstadoOferta
    /** `enviada_at` tal cual lo entregó la BD (lo que muestra la ficha). */
    enviadaAt: string | null
  }
  opciones: readonly OpcionDecision[]
}) {
  const router = useRouter()
  const [dialogo, setDialogo] = useState<Decision | null>(null)
  const [enviadaRevisada, setEnviadaRevisada] = useState<string | null>(null)
  const foco = useFocoTrasCambio()
  const idBloqueos = useId()
  const opcion = (decision: Decision) =>
    opciones.find((candidata) => candidata.decision === decision)
  const bloqueos = opciones.flatMap((candidata) =>
    candidata.bloqueo ? [candidata.bloqueo] : []
  )
  const enRevision = oferta.estado === "EN_REVISION"

  function abrir(decision: Decision) {
    foco.reiniciar()
    setEnviadaRevisada(oferta.enviadaAt)
    setDialogo(decision)
  }

  function cerrar(abierto: boolean) {
    if (!abierto) setDialogo(null)
  }

  async function conAviso(
    decision: Decision,
    resultado: Promise<ResultadoAccion>
  ): Promise<ResultadoAccion> {
    const respuesta = foco.anotar(await resultado)
    if (respuesta.ok) {
      toast.success(TEXTOS[decision].aviso, {
        description: oferta.titulo,
        action: enRevision
          ? {
              label: "Volver a la cola",
              onClick: () => router.push(RUTA_MODERACION),
            }
          : undefined,
      })
    }
    return respuesta
  }

  if (opciones.length === 0) return null

  return (
    <TarjetaFicha
      titulo="Decisión"
      icono={ClipboardCheck}
      descripcion={
        enRevision
          ? "Publicarla la deja visible para los medios elegibles y les avisa."
          : "Cancélala solo si aún no tiene cupos tomados."
      }
    >
      <div className="flex flex-col gap-4">
        {enRevision ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-medium text-muted-foreground">
              Qué comprobar
            </h3>
            <ul className="flex flex-col gap-1.5 text-sm">
              {COMPROBACIONES.map((comprobacion) => (
                <li key={comprobacion} className="flex gap-2 text-pretty">
                  <CircleCheck
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                  {comprobacion}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {bloqueos.length > 0 ? (
          <div
            id={idBloqueos}
            className="flex flex-col gap-1 rounded-lg border border-warning/45 bg-warning/10 px-3 py-2.5 text-sm text-pretty"
          >
            {bloqueos.map((bloqueo) => (
              <p key={bloqueo}>{bloqueo}</p>
            ))}
          </div>
        ) : null}

        <div className="grid gap-2">
          <BotonDecision
            opcion={opcion("publicar")}
            variante="default"
            icono={Megaphone}
            idBloqueos={idBloqueos}
            onAbrir={abrir}
          />
          <BotonDecision
            opcion={opcion("devolver")}
            variante="outline"
            icono={MessageSquareWarning}
            idBloqueos={idBloqueos}
            onAbrir={abrir}
          />
          <BotonDecision
            opcion={opcion("rechazar")}
            variante="destructive"
            icono={ShieldX}
            idBloqueos={idBloqueos}
            onAbrir={abrir}
          />
          <BotonDecision
            opcion={opcion("cancelar")}
            variante="destructive"
            icono={Ban}
            idBloqueos={idBloqueos}
            onAbrir={abrir}
          />
        </div>
      </div>

      <DialogoConfirmacion
        abierto={dialogo === "publicar"}
        onAbiertoChange={cerrar}
        titulo="¿Publicar la oferta?"
        descripcion="Los medios elegibles la verán en el marketplace y recibirán un aviso; el anunciante también. Desde ese momento pueden aceptar cupos."
        textoConfirmar="Publicar"
        focoAlCerrar={foco.focoAlCerrar}
        onConfirmar={() =>
          conAviso(
            "publicar",
            publicarOferta({ ofertaId: oferta.id, enviadaAt: enviadaRevisada })
          )
        }
      />
      <DialogoMotivo
        abierto={dialogo === "devolver"}
        onAbiertoChange={cerrar}
        titulo="¿Devolver la oferta al anunciante?"
        descripcion="Vuelve al anunciante para que la ajuste y la reenvíe. Dile con claridad qué debe corregir."
        etiqueta="Comentario para el anunciante"
        placeholder="Ej.: el enlace de destino no abre; usa una dirección https que funcione…"
        ayuda="Lo verá en su oferta y en el aviso que recibe; queda en el historial."
        sugerencias={SUGERENCIAS_DEVOLUCION}
        textoConfirmar="Devolver"
        focoAlCerrar={foco.focoAlCerrar}
        onConfirmar={(motivo) =>
          conAviso(
            "devolver",
            devolverOferta({
              ofertaId: oferta.id,
              enviadaAt: enviadaRevisada,
              motivo,
            })
          )
        }
      />
      <DialogoMotivo
        abierto={dialogo === "rechazar"}
        onAbiertoChange={cerrar}
        titulo="¿Rechazar la oferta?"
        descripcion="Se cancela y no podrá publicarse. El anunciante recibe el motivo; si quiere intentarlo de nuevo, creará otra oferta."
        etiqueta="Motivo del rechazo"
        placeholder="Ej.: promociona un producto que la política de AMO no permite…"
        ayuda="Lo recibe el anunciante; queda en el historial y en la bitácora."
        sugerencias={SUGERENCIAS_RECHAZO}
        textoConfirmar="Rechazar"
        destructivo
        focoAlCerrar={foco.focoAlCerrar}
        onConfirmar={(motivo) =>
          conAviso(
            "rechazar",
            rechazarOferta({
              ofertaId: oferta.id,
              enviadaAt: enviadaRevisada,
              motivo,
            })
          )
        }
      />
      <DialogoMotivo
        abierto={dialogo === "cancelar"}
        onAbiertoChange={cerrar}
        titulo="¿Cancelar la oferta publicada?"
        descripcion="Deja de estar disponible en el marketplace y los medios ya no podrán tomar cupos. No se puede deshacer."
        etiqueta="Motivo de la cancelación"
        ayuda="Queda en el historial de la oferta y en la bitácora."
        sugerencias={SUGERENCIAS_CANCELACION}
        textoConfirmar="Sí, cancelar la oferta"
        textoCancelar="Volver"
        destructivo
        focoAlCerrar={foco.focoAlCerrar}
        onConfirmar={(motivo) =>
          conAviso(
            "cancelar",
            cancelarOfertaPublicada({ ofertaId: oferta.id, motivo })
          )
        }
      />
    </TarjetaFicha>
  )
}
