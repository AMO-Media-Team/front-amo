"use client"

import { Download } from "lucide-react"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

import { firmarSoporteInterno, firmarSoportePropio } from "../actions"
import { textoRadicado } from "../presentacion"

/**
 * Descarga el PDF de soporte de la respuesta: se firma al pulsar (como
 * servicio, queda `URL_FIRMADA` en la bitácora) y llega como adjunto. El
 * titular solo firma el de sus solicitudes; el equipo, cualquiera. Mientras
 * firma queda deshabilitado pero enfocable.
 */
export function BotonSoporte({
  solicitudId,
  numero,
  perspectiva,
  className,
}: {
  solicitudId: string
  numero: number
  perspectiva: "titular" | "interno"
  className?: string
}) {
  const [descargando, iniciar] = useTransition()
  const firmar =
    perspectiva === "titular" ? firmarSoportePropio : firmarSoporteInterno
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={descargando}
      focusableWhenDisabled
      aria-busy={descargando || undefined}
      className={cn(
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      onClick={() =>
        iniciar(async () => {
          const resultado = await firmar({ solicitudId })
          if (!resultado.ok) {
            toast.error(resultado.error)
            return
          }
          window.location.assign(resultado.datos.url)
        })
      }
    >
      {descargando ? (
        <Spinner role={undefined} aria-hidden data-icon="inline-start" />
      ) : (
        <Download data-icon="inline-start" aria-hidden />
      )}
      Descargar el soporte{" "}
      <span className="sr-only">
        de la respuesta a la solicitud {textoRadicado(numero)}
      </span>
    </Button>
  )
}
