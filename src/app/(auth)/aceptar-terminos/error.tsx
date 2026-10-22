"use client"

import { EstadoError } from "@/components/feedback/estado-error"
import { BotonSalirSinAceptar } from "@/features/terminos/components/boton-salir-sin-aceptar"

/**
 * No se pudieron cargar los términos pendientes. El error raíz ofrecería «Ir
 * al inicio», que vuelve a esta misma compuerta: aquí se reintenta o se sale.
 */
export default function ErrorTerminos({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <EstadoError
      nivelTitulo="h1"
      titulo="No pudimos cargar los términos"
      descripcion="Revisa tu conexión e intenta de nuevo en unos segundos. Si prefieres, sal y vuelve más tarde: tu cuenta sigue disponible."
      onReintentar={retry}
      digest={error.digest}
    >
      <BotonSalirSinAceptar />
    </EstadoError>
  )
}
