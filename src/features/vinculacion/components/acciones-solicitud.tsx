"use client"

import { CircleX, Info, MailPlus } from "lucide-react"
import { useId, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { DialogoMotivo } from "@/features/usuarios/components/dialogo-motivo"

import { descartarSolicitud } from "../actions"
import {
  disponibilidadInvitacion,
  type SolicitudParaInvitar,
} from "../invitacion"
import { HojaInvitar } from "./hoja-invitar"
import { useColaSolicitudes } from "./proveedor-cola"

/**
 * «Invitar» y «Descartar» de una solicitud pendiente. Lo que la persona no
 * puede hacer se explica junto al botón (la BD lo vuelve a exigir).
 */
export function AccionesSolicitud({
  solicitud,
}: {
  solicitud: SolicitudParaInvitar
}) {
  const { capacidades, enfocarResumenTrasRepintar } = useColaSolicitudes()
  const [accion, setAccion] = useState<"invitar" | "descartar" | null>(null)
  const idMotivo = useId()
  const disponibilidad = disponibilidadInvitacion(solicitud, capacidades)

  async function descartar(motivo: string) {
    const resultado = await descartarSolicitud({
      solicitudId: solicitud.id,
      motivo,
    })
    if (resultado.ok) {
      enfocarResumenTrasRepintar()
      toast.success("Solicitud descartada", {
        description: `«${solicitud.nombreMedio}» salió de la cola.`,
      })
    }
    return resultado
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          size="lg"
          onClick={() => setAccion("descartar")}
          className="w-full sm:w-auto"
          aria-label={`Descartar la solicitud de ${solicitud.nombreMedio}`}
        >
          <CircleX data-icon="inline-start" aria-hidden />
          Descartar
        </Button>
        <Button
          size="lg"
          onClick={() => setAccion("invitar")}
          disabled={!disponibilidad.puede}
          aria-describedby={disponibilidad.puede ? undefined : idMotivo}
          className="w-full sm:w-auto"
          aria-label={`Invitar a ${solicitud.nombreMedio}`}
        >
          <MailPlus data-icon="inline-start" aria-hidden />
          Invitar
        </Button>
      </div>
      {disponibilidad.puede ? null : (
        <p
          id={idMotivo}
          className="flex items-start gap-1.5 text-xs text-pretty text-muted-foreground sm:justify-end sm:text-right"
        >
          <Info aria-hidden className="mt-px size-3.5 shrink-0" />
          {disponibilidad.motivo}
        </p>
      )}

      {disponibilidad.puede ? (
        <HojaInvitar
          solicitud={solicitud}
          abierta={accion === "invitar"}
          onAbiertaChange={(abierta) => setAccion(abierta ? "invitar" : null)}
        />
      ) : null}

      <DialogoMotivo
        abierto={accion === "descartar"}
        onAbiertoChange={(abierto) => setAccion(abierto ? "descartar" : null)}
        titulo={`¿Descartar la solicitud de ${solicitud.nombreMedio}?`}
        descripcion={`Saldrá de la cola y no se registrará el medio. No le avisaremos a ${solicitud.contactoNombre}; si quieres explicarle, escríbele tú.`}
        ayuda="El motivo queda en la bitácora y lo ve el equipo AMO."
        textoConfirmar="Descartar"
        destructivo
        onConfirmar={descartar}
      />
    </div>
  )
}
