"use client"

import { House } from "lucide-react"

import { EstadoError } from "@/components/feedback/estado-error"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { RUTA_INICIO } from "@/lib/auth/navegacion"

interface ErrorAplicacionProps {
  error: Error & { digest?: string }
  retry: () => void
}

/** Error de una sección: el AppShell sigue disponible para navegar a otra parte. */
export default function ErrorAplicacion({
  error,
  retry,
}: ErrorAplicacionProps) {
  return (
    <ContenedorPagina ancho="estrecho" className="justify-center">
      <title>Error · AMO</title>
      <EstadoError
        nivelTitulo="h1"
        titulo="No pudimos cargar esta sección"
        descripcion="Ocurrió un problema inesperado y ya quedó registrado. Intenta de nuevo o vuelve al inicio."
        onReintentar={retry}
        digest={error.digest}
        className="rounded-2xl border bg-card/40 py-12"
      >
        <EnlaceBoton variant="outline" href={RUTA_INICIO}>
          <House data-icon="inline-start" aria-hidden />
          Ir al inicio
        </EnlaceBoton>
      </EstadoError>
    </ContenedorPagina>
  )
}
