"use client"

import { Download } from "lucide-react"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

import { firmarArchivoFactura } from "../actions"
import type { EntradaFirmarArchivo } from "../schemas"

/**
 * Descarga un archivo de la factura (PDF de la factura o de una nota crédito,
 * soporte de un pago): pide la URL firmada al hacer clic —queda en la
 * bitácora— y la abre como adjunto, sin salir de la página. Si el archivo no
 * existe (p. ej. en los datos de demostración) lo dice en un aviso.
 */
export function BotonDescargar({
  pedido,
  etiqueta,
  nombreAccesible,
  variante = "outline",
}: {
  pedido: EntradaFirmarArchivo
  etiqueta: string
  /** Nombre completo para lectores de pantalla cuando la etiqueta es corta. */
  nombreAccesible?: string
  variante?: "outline" | "ghost" | "secondary"
}) {
  const [pendiente, iniciar] = useTransition()
  return (
    <Button
      type="button"
      variant={variante}
      size="sm"
      disabled={pendiente}
      aria-label={nombreAccesible}
      onClick={() =>
        iniciar(async () => {
          const resultado = await firmarArchivoFactura({
            ...pedido,
            descargar: true,
          })
          if (!resultado.ok) {
            toast.error("No se pudo descargar", {
              description: resultado.error,
            })
            return
          }
          window.location.assign(resultado.datos.url)
        })
      }
    >
      {pendiente ? (
        <Spinner aria-hidden data-icon="inline-start" role={undefined} />
      ) : (
        <Download data-icon="inline-start" aria-hidden />
      )}
      {etiqueta}
    </Button>
  )
}
