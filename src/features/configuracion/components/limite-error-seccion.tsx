"use client"

import { catchError, type ErrorInfo } from "next/error"

import { EstadoError } from "@/components/feedback/estado-error"

interface PropsLimite {
  /** Título de la sección que no cargó («Precios», «Tributario»…). */
  seccion: string
}

function FallaSeccion({ seccion }: PropsLimite, { error, retry }: ErrorInfo) {
  const digest =
    error instanceof Error && "digest" in error
      ? String(error.digest)
      : undefined
  return (
    <div className="rounded-xl border bg-card">
      <EstadoError
        titulo={`No pudimos cargar «${seccion}»`}
        descripcion="Puede ser un problema de conexión. No se cambió ningún valor: reintenta en unos segundos o abre otra sección."
        onReintentar={() => retry()}
        digest={digest}
        className="py-10"
      />
    </div>
  )
}

/**
 * Límite de error de una sección de Configuración: un fallo al consultar no
 * tumba la página (la navegación sigue disponible). La página lo monta con
 * `key={seccion}`: el error de una sección no se arrastra a la siguiente
 * (`catchError` solo se limpia solo al cambiar de ruta, no de `?seccion=`).
 */
export const LimiteErrorSeccion = catchError(FallaSeccion)
