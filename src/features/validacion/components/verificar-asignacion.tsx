"use client"

import { ShieldCheck } from "lucide-react"
import { useId, useRef, useState } from "react"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { Button } from "@/components/ui/button"
import type { Corte, EstadoAsignacion } from "@/features/operacion/estados"
import {
  cerrarFrase,
  formatearFechaHoraFija,
} from "@/features/operacion/formato"
import type { PublicacionEvidencia } from "@/features/operacion/tipos"
import { DialogoMotivo } from "@/features/usuarios/components/dialogo-motivo"
import type { ResultadoAccion } from "@/lib/result"

import { verificarAsignacion } from "../actions"
import { situacionVerificacion, SUGERENCIAS_CONSTANCIA } from "../decision"

/**
 * Destino del foco tras verificar: el botón desaparece (la asignación ya no
 * está en «Métricas cargadas») y el foco caería al inicio de la página. Va al
 * título de la ficha, que anuncia de qué asignación se trata.
 */
function tituloFicha(): HTMLElement | null {
  const titulo = document.querySelector<HTMLElement>("main h1")
  if (titulo && !titulo.hasAttribute("tabindex")) titulo.tabIndex = -1
  return titulo
}

export interface VerificarAsignacionProps {
  asignacionId: string
  estado: EstadoAsignacion
  publicaciones: PublicacionEvidencia[]
  cortesRequeridos: Corte[]
  /** `metricas.validar`. */
  puedeVerificar: boolean
  /** `metricas.editar_validadas`: constancia manual de la permanencia. */
  puedeConstanciaManual: boolean
}

/**
 * «Verificar» de la ficha de la asignación (ADM-009): METRICAS_CARGADAS →
 * VERIFICADA, la única puerta a la liquidación. Si algo lo impide, el botón
 * queda deshabilitado con el porqué a la vista («Faltan métricas por
 * aprobar», «Permanencia pendiente hasta…»); si solo falta la permanencia y la
 * persona puede corregir métricas validadas, ofrece verificar con constancia
 * manual y motivo obligatorio. La BD vuelve a comprobarlo todo y un fallo se
 * muestra dentro del diálogo. Fuera de «Métricas cargadas» no muestra nada.
 */
export function VerificarAsignacion({
  asignacionId,
  estado,
  publicaciones,
  cortesRequeridos,
  puedeVerificar,
  puedeConstanciaManual,
}: VerificarAsignacionProps) {
  const [ahora] = useState(() => new Date())
  const [dialogo, setDialogo] = useState<"verificar" | "constancia" | null>(
    null
  )
  const cambio = useRef(false)
  const idBloqueo = useId()
  const situacion = situacionVerificacion({
    estado,
    publicaciones,
    cortesRequeridos,
    puedeVerificar,
    puedeConstanciaManual,
    ahora,
  })
  if (situacion.tipo === "no-aplica") return null

  function abrir(tipo: "verificar" | "constancia") {
    cambio.current = false
    setDialogo(tipo)
  }

  function cerrar(abierto: boolean) {
    if (!abierto) setDialogo(null)
  }

  async function verificar(
    constancia: boolean,
    motivo = ""
  ): Promise<ResultadoAccion> {
    const resultado = await verificarAsignacion({
      asignacionId,
      constancia,
      motivo,
    })
    if (resultado.ok) {
      cambio.current = true
      toast.success("Asignación verificada", {
        description: "Ya puede entrar a la liquidación del medio.",
      })
    }
    return resultado
  }

  const focoAlCerrar = () => (cambio.current ? tituloFicha() : null)
  const bloqueada = situacion.tipo === "bloqueada" ? situacion : null

  return (
    <div className="flex min-w-0 flex-col gap-1.5 lg:items-end">
      {bloqueada?.constancia ? (
        <Button
          size="lg"
          variant="outline"
          aria-describedby={idBloqueo}
          onClick={() => abrir("constancia")}
        >
          <ShieldCheck data-icon="inline-start" aria-hidden />
          Verificar con constancia
        </Button>
      ) : (
        <Button
          size="lg"
          disabled={bloqueada !== null}
          aria-describedby={bloqueada ? idBloqueo : undefined}
          onClick={() => abrir("verificar")}
        >
          <ShieldCheck data-icon="inline-start" aria-hidden />
          Verificar
        </Button>
      )}
      {bloqueada ? (
        <div
          id={idBloqueo}
          className="flex max-w-sm flex-col gap-0.5 text-xs text-pretty text-muted-foreground lg:text-right"
        >
          {bloqueada.motivos.map((motivo) => (
            <p key={motivo}>{motivo}</p>
          ))}
          {bloqueada.constancia ? (
            <p>Si comprobaste que sigue en línea, puedes dejar constancia.</p>
          ) : null}
        </div>
      ) : null}

      <DialogoConfirmacion
        abierto={dialogo === "verificar"}
        onAbiertoChange={cerrar}
        titulo="¿Verificar la asignación?"
        descripcion="Todas sus métricas están aprobadas y la permanencia se cumplió. Queda verificada y disponible para la liquidación del medio: es la única puerta a pago."
        textoConfirmar="Verificar"
        focoAlCerrar={focoAlCerrar}
        onConfirmar={() => verificar(false)}
      />
      <DialogoMotivo
        abierto={dialogo === "constancia"}
        onAbiertoChange={cerrar}
        titulo="¿Verificar antes de cumplir la permanencia?"
        descripcion={
          bloqueada?.permanenciaHasta
            ? `La publicación debe seguir en línea hasta el ${cerrarFrase(formatearFechaHoraFija(bloqueada.permanenciaHasta))} Si comprobaste que sigue publicada, deja constancia de lo que revisaste.`
            : "Si comprobaste que la publicación sigue en línea, deja constancia de lo que revisaste."
        }
        etiqueta="Qué comprobaste"
        placeholder="Ej.: abrí la publicación hoy y sigue en línea con la etiqueta de publicidad…"
        ayuda="Queda como constancia de permanencia en la bitácora."
        sugerencias={SUGERENCIAS_CONSTANCIA}
        textoConfirmar="Verificar con constancia"
        focoAlCerrar={focoAlCerrar}
        onConfirmar={(motivo) => verificar(true, motivo)}
      />
    </div>
  )
}
