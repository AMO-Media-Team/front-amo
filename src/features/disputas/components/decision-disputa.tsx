"use client"

import {
  CircleCheck,
  CircleSlash,
  ClipboardCheck,
  Gavel,
  type LucideIcon,
  SearchCheck,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useId, useRef, useState } from "react"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { Button } from "@/components/ui/button"
import { DialogoMotivo } from "@/features/usuarios/components/dialogo-motivo"
import { TarjetaFicha } from "@/features/usuarios/components/tarjeta-ficha"
import type { ResultadoAccion } from "@/lib/result"

import { descartarDisputa, resolverDisputa, tomarDisputa } from "../actions"
import { avisoEstadoDisputa } from "../foco"
import {
  BLOQUEO_SIN_PREVIO,
  type DecisionDisputa as Decision,
  type OpcionDecisionDisputa,
  type OpcionResolucion,
  SUGERENCIAS_DESCARTE,
} from "../resolucion"
import { RUTA_DISPUTAS } from "../rutas"
import type { EstadoDisputa } from "../tipos"
import { DialogoResolver } from "./dialogo-resolver"

/** Qué revisar antes de decidir (ADM-012). */
const COMPROBACIONES: readonly string[] = [
  "Lee la conversación completa y abre los adjuntos de las partes.",
  "Compara con la evidencia y las métricas en la ficha de la asignación.",
  "Si falta información, pídela en la conversación antes de decidir.",
  "Explica la decisión con claridad: las partes la reciben.",
]

const TEXTOS: Readonly<Record<Decision, { boton: string; aviso: string }>> = {
  tomar: { boton: "Tomar en revisión", aviso: "Disputa en revisión" },
  resolver: { boton: "Resolver", aviso: "Disputa resuelta" },
  descartar: { boton: "Descartar", aviso: "Disputa descartada" },
}

const ICONOS: Readonly<Record<Decision, LucideIcon>> = {
  tomar: SearchCheck,
  resolver: Gavel,
  descartar: CircleSlash,
}

function BotonDecision({
  decision,
  variante,
  bloqueo = null,
  idBloqueo,
  onAbrir,
}: {
  decision: Decision
  variante: "default" | "outline"
  bloqueo?: string | null
  idBloqueo: string
  onAbrir: (decision: Decision) => void
}) {
  const Icono = ICONOS[decision]
  return (
    <Button
      size="lg"
      variant={variante}
      disabled={bloqueo !== null}
      aria-describedby={bloqueo ? idBloqueo : undefined}
      onClick={() => onAbrir(decision)}
      className="w-full"
    >
      <Icono data-icon="inline-start" aria-hidden />
      {TEXTOS[decision].boton}
    </Button>
  )
}

export interface DecisionDisputaProps {
  disputa: {
    id: string
    estado: EstadoDisputa
    /** Para el aviso de confirmación (la oferta o el medio). */
    titulo: string
  }
  /** De `decisionesDisputa` (estado y permisos, en el servidor). */
  opciones: readonly OpcionDecisionDisputa[]
  /** De `opcionesResolucion` (estado previo y situación de la asignación). */
  resolucion: readonly OpcionResolucion[]
  /** Fin de la permanencia pendiente (constancia manual al verificar). */
  permanenciaHasta?: string | null
}

/**
 * Decisión del equipo sobre la disputa (ADM-012): tomarla en revisión,
 * resolverla con su efecto sobre la asignación o descartarla con motivo,
 * según lo que permiten su estado y el rol. La BD vuelve a comprobarlo todo y
 * un fallo se muestra dentro del diálogo. Tras decidir, el botón que abrió el
 * diálogo desaparece y el foco va al aviso del estado, que anuncia el nuevo.
 */
export function DecisionDisputa({
  disputa,
  opciones,
  resolucion,
  permanenciaHasta = null,
}: DecisionDisputaProps) {
  const router = useRouter()
  const [dialogo, setDialogo] = useState<Decision | null>(null)
  const cambio = useRef(false)
  const idBloqueo = useId()

  // Resolver o descartar cierra la disputa: el panel desaparece con el
  // diálogo aún abierto y el foco no tendría a dónde volver. Va igual al
  // aviso del estado, que ya anuncia el resultado.
  useEffect(() => {
    const decision = cambio
    return () => {
      if (decision.current) {
        setTimeout(() => avisoEstadoDisputa()?.focus(), 0)
      }
    }
  }, [])

  if (opciones.length === 0) return null
  const tiene = (decision: Decision) =>
    opciones.some((opcion) => opcion.decision === decision)
  const sinResolucion = resolucion.length === 0

  function abrir(decision: Decision) {
    cambio.current = false
    setDialogo(decision)
  }

  function cerrar(abierto: boolean) {
    if (!abierto) setDialogo(null)
  }

  /** Foco tras cerrar: el aviso del estado si algo cambió; si no, el botón. */
  const focoAlCerrar = () => (cambio.current ? avisoEstadoDisputa() : null)

  async function conAviso(
    decision: Decision,
    accion: Promise<ResultadoAccion>
  ): Promise<ResultadoAccion> {
    const respuesta = await accion
    if (respuesta.ok) {
      cambio.current = true
      toast.success(TEXTOS[decision].aviso, {
        description: disputa.titulo,
        action: {
          label: "Volver a la bandeja",
          onClick: () => router.push(RUTA_DISPUTAS),
        },
      })
    }
    return respuesta
  }

  return (
    <TarjetaFicha
      titulo="Decisión"
      icono={ClipboardCheck}
      descripcion="Resuélvela con el efecto que corresponda o descártala."
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            Antes de decidir
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

        {sinResolucion && tiene("resolver") ? (
          <p
            id={idBloqueo}
            className="rounded-lg border border-warning/45 bg-warning/10 px-3 py-2.5 text-sm text-pretty"
          >
            {BLOQUEO_SIN_PREVIO}
          </p>
        ) : null}

        <div className="grid gap-2">
          {tiene("resolver") ? (
            <BotonDecision
              decision="resolver"
              variante="default"
              bloqueo={sinResolucion ? BLOQUEO_SIN_PREVIO : null}
              idBloqueo={idBloqueo}
              onAbrir={abrir}
            />
          ) : null}
          {tiene("tomar") ? (
            <BotonDecision
              decision="tomar"
              variante="outline"
              idBloqueo={idBloqueo}
              onAbrir={abrir}
            />
          ) : null}
          {tiene("descartar") ? (
            <BotonDecision
              decision="descartar"
              variante="outline"
              idBloqueo={idBloqueo}
              onAbrir={abrir}
            />
          ) : null}
        </div>
      </div>

      <DialogoConfirmacion
        abierto={dialogo === "tomar"}
        onAbiertoChange={cerrar}
        titulo="¿Tomar la disputa en revisión?"
        descripcion="Las partes verán que el equipo AMO la está revisando. Después podrás resolverla o descartarla."
        textoConfirmar="Tomar en revisión"
        focoAlCerrar={focoAlCerrar}
        onConfirmar={() =>
          conAviso("tomar", tomarDisputa({ disputaId: disputa.id }))
        }
      />
      <DialogoResolver
        abierto={dialogo === "resolver"}
        onAbiertoChange={cerrar}
        disputaId={disputa.id}
        opciones={resolucion}
        permanenciaHasta={permanenciaHasta}
        focoAlCerrar={focoAlCerrar}
        onConfirmar={(entrada) =>
          conAviso("resolver", resolverDisputa(entrada))
        }
      />
      <DialogoMotivo
        abierto={dialogo === "descartar"}
        onAbiertoChange={cerrar}
        titulo="¿Descartar la disputa?"
        descripcion="No prospera: la asignación vuelve al estado que tenía al abrirse. Las partes reciben el motivo."
        etiqueta="Motivo del descarte"
        placeholder="Ej.: las pruebas no muestran un incumplimiento…"
        ayuda="Lo reciben el medio y el anunciante; queda en la bitácora."
        sugerencias={SUGERENCIAS_DESCARTE}
        textoConfirmar="Descartar"
        focoAlCerrar={focoAlCerrar}
        onConfirmar={(motivo) =>
          conAviso(
            "descartar",
            descartarDisputa({ disputaId: disputa.id, motivo })
          )
        }
      />
    </TarjetaFicha>
  )
}
