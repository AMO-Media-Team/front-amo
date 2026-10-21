"use client"

import { LogOut } from "lucide-react"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { Button } from "@/components/ui/button"

import { cerrarOtrasSesiones } from "../actions"

/**
 * «Cerrar las demás sesiones». `otras` = cuántas hay (`null` si la BD aún no
 * las lista: la acción funciona igual, Auth las cierra todas menos esta).
 */
export function BotonCerrarOtrasSesiones({ otras }: { otras: number | null }) {
  const cerrar = async () => {
    const resultado = await cerrarOtrasSesiones()
    if (resultado.ok) {
      toast.success("Cerramos tus otras sesiones", {
        description: "Solo este dispositivo sigue conectado.",
      })
    }
    return resultado
  }

  return (
    <DialogoConfirmacion
      titulo="¿Cerrar las demás sesiones?"
      descripcion={
        otras
          ? `Se cerrará tu cuenta en ${otras === 1 ? "el otro dispositivo" : `los otros ${otras} dispositivos`}. Este seguirá conectado.`
          : "Se cerrará tu cuenta en cualquier otro navegador o dispositivo. Este seguirá conectado."
      }
      textoConfirmar="Cerrar sesiones"
      destructivo
      disparador={
        <Button variant="outline" disabled={otras === 0}>
          <LogOut data-icon="inline-start" aria-hidden />
          Cerrar las demás sesiones
        </Button>
      }
      onConfirmar={cerrar}
    />
  )
}
