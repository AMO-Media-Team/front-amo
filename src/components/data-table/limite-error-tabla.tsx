"use client"

import { catchError, type ErrorInfo } from "next/error"

import { EstadoError } from "@/components/feedback/estado-error"

interface PropsLimite {
  /** Qué no se pudo cargar ("los usuarios", "las campañas"…). */
  recurso: string
}

function FallaTabla({ recurso }: PropsLimite, { error, retry }: ErrorInfo) {
  const digest =
    error instanceof Error && "digest" in error
      ? String(error.digest)
      : undefined
  return (
    <div className="rounded-xl border bg-card">
      <EstadoError
        titulo={`No pudimos cargar ${recurso}`}
        descripcion="Puede ser un problema de conexión. Tus filtros se conservan: reintenta en unos segundos."
        onReintentar={() => retry()}
        digest={digest}
        className="py-10"
      />
    </div>
  )
}

/**
 * Límite de error de una tabla: un fallo al consultar no tumba la página
 * (encabezado, indicadores y navegación siguen). `retry()` vuelve a pedir el
 * contenido al servidor dentro de una transición.
 */
export const LimiteErrorTabla = catchError(FallaTabla)
