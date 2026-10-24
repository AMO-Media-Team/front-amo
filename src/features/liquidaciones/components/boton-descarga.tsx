"use client"

import { Download } from "lucide-react"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

import { descargarArchivoLiquidacion } from "../actions"
import type { ArchivoLiquidacion } from "../tipos"

const ETIQUETAS: Readonly<Record<ArchivoLiquidacion, string>> = {
  soporte_pago: "Descargar el soporte del pago",
  factura_medio: "Descargar la factura del medio",
}

/**
 * Descarga un archivo de la liquidación: se firma al pulsar (como servicio,
 * queda `URL_FIRMADA` en la bitácora) y llega como adjunto, sin salir de la
 * página. Si el archivo no está (p. ej. datos de demostración), lo dice.
 */
export function BotonDescarga({
  liquidacionId,
  archivo,
  texto = "Descargar",
}: {
  liquidacionId: string
  archivo: ArchivoLiquidacion
  texto?: string
}) {
  const [descargando, iniciar] = useTransition()
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={descargando}
      aria-label={ETIQUETAS[archivo]}
      onClick={() =>
        iniciar(async () => {
          const resultado = await descargarArchivoLiquidacion({
            liquidacionId,
            archivo,
          })
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
      {texto}
    </Button>
  )
}
