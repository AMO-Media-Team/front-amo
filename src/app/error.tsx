"use client"

import { House } from "lucide-react"

import { EstadoError } from "@/components/feedback/estado-error"
import { PantallaEstado } from "@/components/feedback/pantalla-estado"
import { EnlaceBoton } from "@/components/layout/enlace-boton"

interface ErrorRaizProps {
  error: Error & { digest?: string }
  retry: () => void
}

export default function ErrorRaiz({ error, retry }: ErrorRaizProps) {
  return (
    <PantallaEstado>
      <title>Error · AMO</title>
      <EstadoError
        nivelTitulo="h1"
        titulo="No pudimos mostrar esta página"
        descripcion="Ocurrió un problema inesperado. Ya quedó registrado; puedes reintentar o volver al inicio."
        onReintentar={retry}
        digest={error.digest}
      >
        <EnlaceBoton variant="outline" href="/">
          <House data-icon="inline-start" aria-hidden />
          Ir al inicio
        </EnlaceBoton>
      </EstadoError>
    </PantallaEstado>
  )
}
