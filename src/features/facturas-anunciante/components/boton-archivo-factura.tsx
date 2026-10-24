"use client"

import { Download } from "lucide-react"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

import { firmarArchivoFactura } from "../actions"
import type { TipoArchivoFactura } from "../tipos"

/**
 * Descarga un archivo de la factura (PDF, soporte de un pago o nota
 * crédito): pide la URL firmada como adjunto en el clic y la abre en la misma
 * pestaña, así el navegador la guarda sin salir de la página (también en el
 * celular, donde una pestaña nueva tras esperar al servidor se bloquearía).
 * Un fallo (p. ej. el archivo ya no está) se avisa con un toast.
 */
export function BotonArchivoFactura({
  tipo,
  id,
  texto,
  nombre,
  variante = "outline",
  tamano = "sm",
  className,
}: {
  tipo: TipoArchivoFactura
  id: string
  /** Lo que se ve («PDF», «Soporte»). */
  texto: string
  /**
   * Nombre accesible completo, que CONTIENE `texto` (WCAG 2.5.3): «Descargar
   * el PDF de la factura FE1042». Distingue los botones de cada fila.
   */
  nombre: string
  variante?: "outline" | "default" | "ghost" | "secondary"
  tamano?: "sm" | "default" | "lg"
  className?: string
}) {
  const [descargando, iniciar] = useTransition()
  return (
    <Button
      type="button"
      variant={variante}
      size={tamano}
      disabled={descargando}
      aria-label={nombre}
      aria-busy={descargando || undefined}
      className={cn(className)}
      onClick={() =>
        iniciar(async () => {
          const resultado = await firmarArchivoFactura({
            tipo,
            id,
            descargar: true,
          })
          if (!resultado.ok) {
            toast.error(resultado.error)
            return
          }
          // Llega como adjunto (`Content-Disposition`): no sale de la página.
          window.location.assign(resultado.datos.url)
        })
      }
    >
      {descargando ? (
        <Spinner data-icon="inline-start" role={undefined} aria-hidden />
      ) : (
        <Download data-icon="inline-start" aria-hidden />
      )}
      {texto}
    </Button>
  )
}
