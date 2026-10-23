"use client"

import { Send } from "lucide-react"
import { useId, useRef } from "react"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { enviarEmpresaAVerificacion } from "../actions"
import { enumerar, ID_SITUACION_VERIFICACION } from "../verificacion"

/**
 * «Enviar a verificación» con confirmación. Si falta algo, el botón queda
 * inactivo y el texto de al lado dice qué (el lector de pantalla lo lee con
 * el botón). La acción y la BD vuelven a exigir lo mismo: si en el camino algo
 * cambió, el diálogo muestra su mensaje y sigue abierto. Enviada, el botón
 * desaparece: el foco va a `destinoFoco` (un titular con `tabIndex={-1}` que
 * sigue en la página) en vez de perderse en <body>.
 */
export function BotonEnviarVerificacion({
  faltantes,
  reenvio = false,
  compacto = false,
  destinoFoco = ID_SITUACION_VERIFICACION,
}: {
  /** Lo que falta, en frase (vacío: se puede enviar). */
  faltantes: readonly string[]
  /** Tras un rechazo: «Volver a enviar». */
  reenvio?: boolean
  /** Dentro de una nota (resumen de documentos): texto y botón apilados. */
  compacto?: boolean
  /**
   * Id del elemento que recibe el foco tras enviarla (por defecto, el titular
   * de la tarjeta de verificación).
   */
  destinoFoco?: string
}) {
  const idAyuda = useId()
  const enviada = useRef(false)
  const texto = reenvio ? "Volver a enviar" : "Enviar a verificación"
  const listo = faltantes.length === 0
  const contenedor = cn(
    "flex flex-col gap-2",
    !compacto && "sm:flex-row sm:items-center sm:justify-between sm:gap-4"
  )
  const ancho = compacto ? "w-full" : "w-full sm:w-auto"

  if (!listo) {
    return (
      <div className={contenedor}>
        <p id={idAyuda} className="text-sm text-pretty text-muted-foreground">
          Para enviar tu empresa a verificación aún necesitamos{" "}
          {enumerar(faltantes)}.
        </p>
        {/* `aria-disabled` y no `disabled`: sigue siendo enfocable y el lector
            de pantalla lee con él qué falta. */}
        <Button
          type="button"
          size="lg"
          aria-disabled="true"
          aria-describedby={idAyuda}
          className={cn(ancho, "shrink-0 cursor-not-allowed opacity-60")}
        >
          <Send data-icon="inline-start" aria-hidden />
          {texto}
        </Button>
      </div>
    )
  }

  return (
    <div className={contenedor}>
      <p id={idAyuda} className="text-sm text-pretty text-muted-foreground">
        Revisaremos tus datos y documentos y te avisaremos el resultado por
        notificación.
      </p>
      <DialogoConfirmacion
        titulo={
          reenvio
            ? "¿Volver a enviar tu empresa a verificación?"
            : "¿Enviar tu empresa a verificación?"
        }
        descripcion="El equipo de AMO revisará tus datos y documentos. Mientras tanto puedes seguir actualizándolos; no hace falta volver a enviarla."
        textoConfirmar={texto}
        focoAlCerrar={() =>
          enviada.current ? document.getElementById(destinoFoco) : null
        }
        disparador={
          <Button
            size="lg"
            aria-describedby={idAyuda}
            className={cn(ancho, "shrink-0")}
          >
            <Send data-icon="inline-start" aria-hidden />
            {texto}
          </Button>
        }
        onConfirmar={async () => {
          // Si la página se refresca antes de que responda, el diálogo se
          // desmonta con el botón: para entonces ya se envió.
          enviada.current = true
          const resultado = await enviarEmpresaAVerificacion().catch(
            (error: unknown) => {
              enviada.current = false
              throw error
            }
          )
          enviada.current = resultado.ok
          if (resultado.ok) {
            toast.success("Tu empresa quedó en revisión", {
              description: "Te avisaremos cuando el equipo de AMO decida.",
            })
          }
          return resultado
        }}
      />
    </div>
  )
}
