"use client"

import { catchError, type ErrorInfo } from "next/error"

import { EstadoError } from "@/components/feedback/estado-error"
import { cn } from "@/lib/utils"

import { CLASE_LIENZO } from "./lienzo"

function FallaMapa(_props: object, { error, retry }: ErrorInfo) {
  const digest =
    error instanceof Error && "digest" in error
      ? String(error.digest)
      : undefined
  return (
    <div
      className={cn(
        "grid place-items-center bg-background patron-rejilla",
        CLASE_LIENZO
      )}
    >
      <div className="max-w-md rounded-2xl vidrio">
        <EstadoError
          titulo="No pudimos mostrar el mapa"
          descripcion="El resto de AMO sigue disponible. Reintenta; si persiste, puede que tu navegador no tenga WebGL activo."
          onReintentar={() => retry()}
          digest={digest}
        />
      </div>
    </div>
  )
}

/**
 * Límite de error del explorador: un fallo del mapa (WebGL, datos
 * inesperados) no tumba el AppShell; `retry()` vuelve a montar el widget.
 */
export const LimiteErrorMapa = catchError(FallaMapa)
