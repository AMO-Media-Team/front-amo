"use client"

import { Ban, RotateCcw } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { DialogoMotivo } from "@/features/usuarios/components/dialogo-motivo"

import { reactivarAnunciante, suspenderAnunciante } from "../actions"
import type { AccionEstado } from "../decision"
import {
  MOTIVOS_REACTIVACION,
  MOTIVOS_SUSPENSION,
  PLACEHOLDER_MOTIVO,
} from "../presentacion"

/**
 * «Suspender» (VERIFICADO) o «Reactivar» (SUSPENDIDO) en la cabecera de la
 * ficha del anunciante, con motivo (`anunciantes.suspender`). La empresa
 * recibe un aviso con el motivo; la BD revalida permiso y estado. Es un solo
 * botón que cambia de texto: al confirmar, el mismo nodo sigue en la cabecera
 * (ahora con la acción contraria) y el foco vuelve a él, no a <body>.
 */
export function AccionesEstadoAnunciante({
  anunciante,
  acciones,
}: {
  anunciante: { id: string; nombreComercial: string }
  /** Lo que la persona puede hacer (`accionesEstado`, en el servidor). */
  acciones: readonly AccionEstado[]
}) {
  const [dialogo, setDialogo] = useState<AccionEstado | null>(null)
  const nombre = anunciante.nombreComercial

  function cerrar(abierto: boolean) {
    if (!abierto) setDialogo(null)
  }

  // Suspender y reactivar se excluyen (VERIFICADO o SUSPENDIDO).
  const accion: AccionEstado | null = acciones.includes("suspender")
    ? "suspender"
    : acciones.includes("reactivar")
      ? "reactivar"
      : null
  if (!accion) return null

  return (
    <>
      <Button variant="outline" onClick={() => setDialogo(accion)}>
        {accion === "suspender" ? (
          <Ban data-icon="inline-start" aria-hidden />
        ) : (
          <RotateCcw data-icon="inline-start" aria-hidden />
        )}
        {accion === "suspender" ? "Suspender" : "Reactivar"}
      </Button>

      <DialogoMotivo
        abierto={dialogo === "suspender"}
        onAbiertoChange={cerrar}
        destructivo
        titulo={`¿Suspender a ${nombre}?`}
        descripcion="Mientras siga suspendida no podrá enviar ofertas a revisión y sus ofertas publicadas no recibirán aceptaciones nuevas; lo que ya está en curso sigue su trámite. Su equipo recibirá un aviso con el motivo."
        ayuda="La empresa lo verá tal cual; queda en la bitácora."
        sugerencias={MOTIVOS_SUSPENSION}
        placeholder={PLACEHOLDER_MOTIVO}
        textoConfirmar="Suspender empresa"
        onConfirmar={async (motivo) => {
          const resultado = await suspenderAnunciante({
            anuncianteId: anunciante.id,
            motivo,
          })
          if (resultado.ok) {
            toast.success("Empresa suspendida", { description: nombre })
          }
          return resultado
        }}
      />

      <DialogoMotivo
        abierto={dialogo === "reactivar"}
        onAbiertoChange={cerrar}
        titulo={`¿Reactivar a ${nombre}?`}
        descripcion="Vuelve a estar verificada: podrá enviar ofertas a revisión y recibir aceptaciones. Su equipo recibirá un aviso."
        etiqueta="Motivo de la reactivación"
        ayuda="Queda en la bitácora junto con el cambio."
        sugerencias={MOTIVOS_REACTIVACION}
        placeholder={PLACEHOLDER_MOTIVO}
        textoConfirmar="Reactivar empresa"
        onConfirmar={async (motivo) => {
          const resultado = await reactivarAnunciante({
            anuncianteId: anunciante.id,
            motivo,
          })
          if (resultado.ok) {
            toast.success("Empresa reactivada", { description: nombre })
          }
          return resultado
        }}
      />
    </>
  )
}
