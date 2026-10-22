"use client"

import { ArrowLeft } from "lucide-react"

import { EstadoError } from "@/components/feedback/estado-error"
import { EnlaceBoton } from "@/components/layout/enlace-boton"

/** El formulario no pudo cargar sus datos (territorio o política). */
export default function ErrorVincular({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <EstadoError
      nivelTitulo="h1"
      titulo="No pudimos abrir el formulario"
      descripcion="Revisa tu conexión e intenta de nuevo en unos segundos."
      onReintentar={retry}
      digest={error.digest}
    >
      <EnlaceBoton variant="outline" href="/ingresar">
        <ArrowLeft data-icon="inline-start" aria-hidden />
        Ir a ingresar
      </EnlaceBoton>
    </EstadoError>
  )
}
