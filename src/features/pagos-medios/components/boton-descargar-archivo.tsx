"use client"

import { Download } from "lucide-react"
import { useId, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { formatearFechaCompacta } from "@/features/operacion/formato"

import { descargarArchivoPagos } from "../actions"
import { MENSAJES_PAGOS } from "../errores"

/**
 * Descarga un archivo de pagos ya generado: la URL se firma al hacer clic (y
 * queda en la bitácora). Sin «Ver datos sensibles» queda deshabilitado y
 * enfocable, con el porqué. Un archivo que ya no está en Storage (p. ej. los
 * de los datos demo) se explica con un aviso.
 */
export function BotonDescargarArchivo({
  dispersionId,
  creadaAt,
  puedeVerDatosSensibles,
  compacto = false,
}: {
  dispersionId: string
  creadaAt: string
  puedeVerDatosSensibles: boolean
  /** Solo el icono (filas de la tabla); el nombre va para lectores de pantalla. */
  compacto?: boolean
}) {
  const [descargando, iniciar] = useTransition()
  const idExplicacion = useId()
  const nombre = `Descargar el archivo del ${formatearFechaCompacta(creadaAt)}`
  const bloqueado = !puedeVerDatosSensibles

  function descargar() {
    iniciar(async () => {
      const resultado = await descargarArchivoPagos({ dispersionId })
      if (!resultado.ok) {
        toast.error(resultado.error)
        return
      }
      // Llega como adjunto (`Content-Disposition`): no sale de la página.
      window.location.assign(resultado.datos.url)
    })
  }

  const icono = descargando ? (
    <Spinner data-icon="inline-start" role={undefined} aria-hidden />
  ) : (
    <Download data-icon="inline-start" aria-hidden />
  )

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={compacto ? "icon-sm" : "default"}
        disabled={bloqueado || descargando}
        focusableWhenDisabled
        aria-label={compacto ? nombre : undefined}
        title={
          bloqueado
            ? MENSAJES_PAGOS.sinDatosSensibles
            : compacto
              ? nombre
              : undefined
        }
        aria-describedby={bloqueado ? idExplicacion : undefined}
        className="data-disabled:cursor-not-allowed data-disabled:opacity-50"
        onClick={descargar}
      >
        {icono}
        {compacto ? null : "Descargar archivo"}
      </Button>
      {bloqueado ? (
        <span id={idExplicacion} className="sr-only">
          {MENSAJES_PAGOS.sinDatosSensibles}
        </span>
      ) : null}
    </>
  )
}
