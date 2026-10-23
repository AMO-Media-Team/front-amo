"use client"

import { catchError, type ErrorInfo } from "next/error"

import { EstadoError } from "@/components/feedback/estado-error"

interface PropsLimite {
  /** Qué no se pudo cargar («la oferta», «el asistente de oferta»). */
  recurso: string
}

function FallaAsistente({ recurso }: PropsLimite, { error, retry }: ErrorInfo) {
  const digest =
    error instanceof Error && "digest" in error
      ? String(error.digest)
      : undefined
  return (
    <div className="rounded-2xl border bg-card">
      <EstadoError
        titulo={`No pudimos cargar ${recurso}`}
        descripcion="Puede ser un problema de conexión. No se cambió nada: reintenta en unos segundos."
        onReintentar={() => retry()}
        digest={digest}
        className="py-10"
      />
    </div>
  )
}

/**
 * Límite de error del asistente: una consulta que falla no tumba la página
 * (barra y navegación siguen); `retry()` vuelve a pedir el contenido.
 */
export const LimiteErrorAsistente = catchError(FallaAsistente)
