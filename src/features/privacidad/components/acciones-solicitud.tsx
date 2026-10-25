"use client"

import {
  CalendarClock,
  ClipboardCheck,
  Inbox,
  type LucideIcon,
  MessageSquareWarning,
  SearchCheck,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { Button } from "@/components/ui/button"
import { DialogoMotivo } from "@/features/usuarios/components/dialogo-motivo"
import { TarjetaFicha } from "@/features/usuarios/components/tarjeta-ficha"
import type { ResultadoAccion } from "@/lib/result"

import {
  prorrogarSolicitud,
  requerirInformacion,
  tramitarSolicitud,
} from "../actions"
import {
  type AccionesEquipo,
  claseDe,
  formatearDia,
  PLAZOS_LEGALES,
  textoRadicado,
} from "../presentacion"
import type { TipoSolicitud } from "../tipos"
import { DialogoResponder } from "./dialogo-responder"
import { avisoEstadoSolicitud } from "./foco"

type Accion = "tramitar" | "requerir" | "prorrogar" | "responder"

const BOTONES: readonly {
  accion: Accion
  texto: string
  icono: LucideIcon
  variante: "default" | "outline"
}[] = [
  {
    accion: "responder",
    texto: "Responder",
    icono: Inbox,
    variante: "default",
  },
  {
    accion: "tramitar",
    texto: "Tomar en trámite",
    icono: SearchCheck,
    variante: "outline",
  },
  {
    accion: "requerir",
    texto: "Pedir información",
    icono: MessageSquareWarning,
    variante: "outline",
  },
  {
    accion: "prorrogar",
    texto: "Prorrogar el plazo",
    icono: CalendarClock,
    variante: "outline",
  },
]

const SUGERENCIAS_REQUERIMIENTO = [
  "Para atender tu solicitud necesitamos que nos indiques exactamente qué dato está equivocado y cuál es el correcto.",
  "Para atender tu reclamo necesitamos que nos expliques qué uso de tus datos quieres que dejemos de hacer.",
] as const

export interface AccionesSolicitudProps {
  solicitud: {
    id: string
    numero: number
    tipo: TipoSolicitud
    plazoVence: string
  }
  /** De `accionesEquipo` (estado, plazo y prórroga, en el servidor). */
  acciones: AccionesEquipo
}

/**
 * Las acciones del equipo sobre la solicitud (`privacidad.gestionar`):
 * tomarla en trámite, pedir información (solo en un reclamo incompleto y sin
 * prórroga, art. 15; la ventana de 5 días hábiles la comprueba la BD),
 * prorrogar una vez antes del vencimiento y responder. La BD vuelve a
 * comprobarlo todo y un fallo se muestra dentro del diálogo. Tras el cambio,
 * el foco va al aviso del estado, que anuncia el nuevo.
 */
export function AccionesSolicitud({
  solicitud,
  acciones,
}: AccionesSolicitudProps) {
  const [dialogo, setDialogo] = useState<Accion | null>(null)
  const cambio = useRef(false)
  const radicado = textoRadicado(solicitud.numero)
  const { prorroga, norma } = PLAZOS_LEGALES[claseDe(solicitud.tipo)]

  // Si la acción hace desaparecer el panel con el diálogo abierto, el foco va
  // igual al aviso del estado.
  useEffect(() => {
    const huboCambio = cambio
    return () => {
      if (huboCambio.current) {
        setTimeout(() => avisoEstadoSolicitud()?.focus(), 0)
      }
    }
  }, [])

  const disponibles = BOTONES.filter(({ accion }) => acciones[accion])
  if (disponibles.length === 0) return null

  function abrir(accion: Accion) {
    cambio.current = false
    setDialogo(accion)
  }

  function cerrar(abierto: boolean) {
    if (!abierto) setDialogo(null)
  }

  const focoAlCerrar = () => (cambio.current ? avisoEstadoSolicitud() : null)

  async function conAviso<T>(
    titulo: string,
    accion: Promise<ResultadoAccion<T>>,
    descripcion = `Solicitud ${radicado}`
  ): Promise<ResultadoAccion<T>> {
    const respuesta = await accion
    if (respuesta.ok) {
      cambio.current = true
      toast.success(titulo, { description: descripcion })
    }
    return respuesta
  }

  return (
    <TarjetaFicha
      titulo="Atender la solicitud"
      icono={ClipboardCheck}
      descripcion={`Plazo legal hasta el ${formatearDia(solicitud.plazoVence, "largo")}.`}
    >
      <div className="grid gap-2">
        {disponibles.map(({ accion, texto, icono: Icono, variante }) => (
          <Button
            key={accion}
            type="button"
            size="lg"
            variant={variante}
            className="w-full"
            onClick={() => abrir(accion)}
          >
            <Icono data-icon="inline-start" aria-hidden />
            {texto}
          </Button>
        ))}
      </div>

      <DialogoConfirmacion
        abierto={dialogo === "tramitar"}
        onAbiertoChange={cerrar}
        titulo={`¿Tomar en trámite la solicitud ${radicado}?`}
        descripcion="Quedas como responsable. El titular verá que el equipo la está atendiendo; el plazo legal no cambia."
        textoConfirmar="Tomar en trámite"
        focoAlCerrar={focoAlCerrar}
        onConfirmar={() =>
          conAviso(
            "Solicitud en trámite",
            tramitarSolicitud({ solicitudId: solicitud.id })
          )
        }
      />
      <DialogoMotivo
        abierto={dialogo === "requerir"}
        onAbiertoChange={cerrar}
        titulo="Pedir información al titular"
        descripcion="Si el reclamo llegó incompleto, pídele lo que falta. El plazo se detiene hasta que responda y, si no lo hace en el plazo de desistimiento, se cierra solo."
        etiqueta="Qué necesitas"
        placeholder="Ej.: indícanos qué dato está equivocado y cuál es el correcto…"
        ayuda="El art. 15 de la Ley 1581 lo permite dentro de los 5 días hábiles siguientes al recibo y antes de prorrogar el plazo; después, la base de datos lo rechaza. Lo recibe el titular y queda en la bitácora."
        sugerencias={SUGERENCIAS_REQUERIMIENTO}
        textoConfirmar="Pedir información"
        focoAlCerrar={focoAlCerrar}
        onConfirmar={(requerimiento) =>
          conAviso(
            "Le pedimos información al titular",
            requerirInformacion({ solicitudId: solicitud.id, requerimiento })
          )
        }
      />
      <DialogoMotivo
        abierto={dialogo === "prorrogar"}
        onAbiertoChange={cerrar}
        titulo="Prorrogar el plazo"
        descripcion={`Una sola vez y antes del vencimiento: hasta ${prorroga} días hábiles más (${norma}). El titular recibe el motivo y la nueva fecha.`}
        etiqueta="Motivo de la prórroga"
        placeholder="Ej.: necesitamos verificar los datos con el área de pagos…"
        ayuda="Lo recibe el titular; queda en la bitácora."
        textoConfirmar="Prorrogar"
        focoAlCerrar={focoAlCerrar}
        onConfirmar={async (motivo) => {
          const respuesta = await prorrogarSolicitud({
            solicitudId: solicitud.id,
            motivo,
          })
          return conAviso(
            "Plazo prorrogado",
            Promise.resolve(respuesta),
            respuesta.ok
              ? `Nuevo vencimiento: ${formatearDia(respuesta.datos.plazoVence, "largo")}.`
              : undefined
          )
        }}
      />
      <DialogoResponder
        abierto={dialogo === "responder"}
        onAbiertoChange={cerrar}
        solicitud={solicitud}
        onRespondida={() => {
          cambio.current = true
          toast.success("Solicitud respondida", {
            description: `El titular recibió la respuesta a la solicitud ${radicado}.`,
          })
          setTimeout(() => avisoEstadoSolicitud()?.focus(), 0)
        }}
      />
    </TarjetaFicha>
  )
}
