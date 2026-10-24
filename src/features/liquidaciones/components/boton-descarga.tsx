"use client"

import { Download } from "lucide-react"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

import { descargarArchivoLiquidacion } from "../actions"
import type { ArchivoLiquidacion } from "../tipos"

/** Lo que completa el texto visible del botón «Descargar» (solo para lectores de pantalla). */
const COMPLEMENTOS: Readonly<Record<ArchivoLiquidacion, string>> = {
  soporte_pago: "el soporte del pago",
  factura_medio: "la factura del medio",
}

/**
 * Descarga un archivo de la liquidación: se firma al pulsar (como servicio,
 * queda `URL_FIRMADA` en la bitácora) y llega como adjunto, sin salir de la
 * página. Si el archivo no está (p. ej. datos de demostración), lo dice.
 *
 * El nombre accesible empieza por el texto visible y lo completa con un
 * `sr-only` (WCAG 2.5.3: quien dice «pulsar Descargar PDF» lo activa).
 * Mientras firma queda deshabilitado pero enfocable: el foco no se pierde y
 * un segundo Enter tras un error vuelve a intentarlo.
 */
export function BotonDescarga({
  liquidacionId,
  archivo,
  texto = "Descargar",
  complemento = COMPLEMENTOS[archivo],
}: {
  liquidacionId: string
  archivo: ArchivoLiquidacion
  /** Texto visible; el nombre accesible empieza por él. */
  texto?: string
  /** Lo que sigue al texto en el nombre accesible, p. ej. «de la factura del medio». */
  complemento?: string
}) {
  const [descargando, iniciar] = useTransition()
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={descargando}
      focusableWhenDisabled
      aria-busy={descargando || undefined}
      // Enfocable aunque esté deshabilitado: no hay `:disabled` que lo atenúe.
      className="data-disabled:cursor-not-allowed data-disabled:opacity-50"
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
      {texto} <span className="sr-only">{complemento}</span>
    </Button>
  )
}
