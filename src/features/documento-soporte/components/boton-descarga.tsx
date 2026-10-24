"use client"

import { Download } from "lucide-react"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

import { firmarArchivoDocumentoSoporte } from "../actions"
import type { ArchivoDocumento } from "../schemas"

export interface BotonDescargaProps {
  documentoId: string
  archivo: ArchivoDocumento
  /** Lo que se ve: «PDF del documento». */
  etiqueta: string
  /** Lo que oye el lector de pantalla si la etiqueta no basta («del documento DS9»). */
  complemento?: string
  /** Qué hacer si el archivo no existe (p. ej. en los datos demo). */
  ayudaSiFalla?: string
}

/**
 * Descarga un archivo del documento soporte: firma al pulsar (como servicio, queda en la bitácora) y el
 * navegador lo guarda sin salir de la página. Si falla, lo dice en un aviso. Mientras firma sigue
 * enfocable (`focusableWhenDisabled`): el foco no se pierde y, si falla, Enter vuelve a intentarlo.
 */
export function BotonDescarga({
  documentoId,
  archivo,
  etiqueta,
  complemento,
  ayudaSiFalla,
}: BotonDescargaProps) {
  const [descargando, iniciar] = useTransition()
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={descargando}
      focusableWhenDisabled
      aria-busy={descargando || undefined}
      className="data-disabled:cursor-not-allowed data-disabled:opacity-50"
      // El nombre empieza por lo que se ve (WCAG 2.5.3) y dice de qué documento es.
      aria-label={complemento ? `${etiqueta} ${complemento}` : undefined}
      onClick={() =>
        iniciar(async () => {
          const resultado = await firmarArchivoDocumentoSoporte({
            documentoId,
            archivo,
          })
          if (!resultado.ok) {
            toast.error(resultado.error, {
              description: ayudaSiFalla,
            })
            return
          }
          // Llega como adjunto (`Content-Disposition`): no sale de la página.
          window.location.assign(resultado.datos.url)
        })
      }
    >
      {descargando ? (
        <Spinner role={undefined} aria-hidden data-icon="inline-start" />
      ) : (
        <Download data-icon="inline-start" aria-hidden />
      )}
      {etiqueta}
    </Button>
  )
}
