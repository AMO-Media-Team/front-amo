"use client"

import { Download } from "lucide-react"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

import { firmarArchivoLiquidacion } from "../actions"
import { ETIQUETAS_ARCHIVO } from "../presentacion"
import type { ArchivoLiquidacion } from "../tipos"

/**
 * Descarga un archivo de la liquidación (soporte de pago, documento soporte o
 * la factura del medio): pide la URL firmada al tocar y la abre como adjunto,
 * sin salir de la página. Si el archivo no está (p. ej. aún no se genera), lo
 * dice en un aviso y el foco se queda en el botón.
 */
export function BotonDescargaLiquidacion({
  liquidacionId,
  archivo,
  contexto,
  className,
}: {
  liquidacionId: string
  archivo: ArchivoLiquidacion
  /** Lo que distingue este botón de los de otras filas («del periodo 1 – 15 oct 2026»). */
  contexto?: string
  className?: string
}) {
  const [descargando, iniciar] = useTransition()
  const etiqueta = ETIQUETAS_ARCHIVO[archivo]

  function descargar() {
    iniciar(async () => {
      const resultado = await firmarArchivoLiquidacion({
        liquidacionId,
        archivo,
      })
      if (!resultado.ok) {
        toast.error(`No pudimos descargar: ${etiqueta.toLowerCase()}`, {
          description: resultado.error,
        })
        return
      }
      // Llega como adjunto (`Content-Disposition`): no sale de la página.
      window.location.assign(resultado.datos.url)
    })
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={descargar}
      disabled={descargando}
      aria-busy={descargando || undefined}
      className={cn("relative z-10", className)}
    >
      {descargando ? (
        <Spinner data-icon="inline-start" role={undefined} aria-hidden />
      ) : (
        <Download data-icon="inline-start" aria-hidden />
      )}
      {etiqueta}
      {contexto ? (
        <>
          {" "}
          <span className="sr-only">{contexto}</span>
        </>
      ) : null}
    </Button>
  )
}
