"use client"

import { Send } from "lucide-react"
import { useId } from "react"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { Button } from "@/components/ui/button"

import { enviarMedioAVerificacion } from "../actions"
import { enumerar } from "../alta"

/**
 * «Enviar a verificación» con confirmación. Si falta algo, el botón queda
 * inactivo y el texto de al lado dice qué (el lector de pantalla lo lee con
 * el botón). La BD vuelve a exigir lo mismo: si en el camino algo cambió,
 * el diálogo muestra su mensaje y sigue abierto.
 */
export function BotonEnviarVerificacion({
  faltantes,
  reenvio = false,
}: {
  /** Pasos sin completar, nombrados en frase (vacío: se puede enviar). */
  faltantes: readonly string[]
  /** Tras un rechazo: «Volver a enviar». */
  reenvio?: boolean
}) {
  const idAyuda = useId()
  const texto = reenvio ? "Volver a enviar" : "Enviar a verificación"
  const listo = faltantes.length === 0

  if (!listo) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p id={idAyuda} className="text-sm text-muted-foreground">
          Para enviar a verificación completa {enumerar(faltantes)}.
        </p>
        {/* `aria-disabled` y no `disabled`: sigue siendo enfocable y el lector
            de pantalla lee con él qué falta. */}
        <Button
          type="button"
          size="lg"
          aria-disabled="true"
          aria-describedby={idAyuda}
          className="w-full cursor-not-allowed opacity-60 sm:w-auto"
        >
          <Send data-icon="inline-start" aria-hidden />
          {texto}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <p id={idAyuda} className="text-sm text-muted-foreground">
        Revisaremos tu perfil, documentos, cuentas y datos de pago. Te avisamos
        el resultado por notificación.
      </p>
      <DialogoConfirmacion
        titulo={
          reenvio
            ? "¿Volver a enviar tu medio a verificación?"
            : "¿Enviar tu medio a verificación?"
        }
        descripcion="El equipo de AMO revisará tu información. Mientras tanto puedes seguir actualizándola; no hace falta volver a enviarla."
        textoConfirmar={texto}
        disparador={
          <Button
            size="lg"
            aria-describedby={idAyuda}
            className="w-full sm:w-auto"
          >
            <Send data-icon="inline-start" aria-hidden />
            {texto}
          </Button>
        }
        onConfirmar={async () => {
          const resultado = await enviarMedioAVerificacion()
          if (resultado.ok) {
            toast.success("Tu medio quedó en revisión", {
              description: "Te avisaremos cuando el equipo de AMO decida.",
            })
          }
          return resultado
        }}
      />
    </div>
  )
}
