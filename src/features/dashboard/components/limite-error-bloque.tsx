"use client"

import { catchError, type ErrorInfo } from "next/error"
import { useEffect, useRef } from "react"

import { EstadoError } from "@/components/feedback/estado-error"
import { cn } from "@/lib/utils"

import { useActualizandoPanel } from "./proveedor-periodo"

interface PropsLimite {
  /** Nombre del bloque ("Tendencia del GMV"). */
  titulo: string
  className?: string
}

/**
 * Aviso del bloque que falló. Next solo limpia el error al cambiar de ruta, y
 * cambiar de periodo no la cambia: al terminar de llegar el panel del periodo
 * nuevo se vuelve a pintar el bloque con lo que trajo (`reset()`, sin otra
 * consulta). Si también falló, el límite lo recoge de nuevo.
 */
function AvisoFalla({
  titulo,
  className,
  error,
  reset,
  retry,
}: PropsLimite & ErrorInfo) {
  const actualizando = useActualizandoPanel()
  const estabaActualizando = useRef(actualizando)
  useEffect(() => {
    if (estabaActualizando.current && !actualizando) reset()
    estabaActualizando.current = actualizando
  }, [actualizando, reset])

  const digest =
    error instanceof Error && "digest" in error
      ? String(error.digest)
      : undefined
  return (
    <div
      className={cn(
        "flex h-full min-h-56 items-center rounded-xl border border-dashed bg-card/60",
        className
      )}
    >
      <EstadoError
        compacto
        nivelTitulo="h2"
        titulo={`No pudimos cargar «${titulo}»`}
        descripcion="El resto del panel sigue disponible. Reintenta en unos segundos."
        onReintentar={() => retry()}
        digest={digest}
      />
    </div>
  )
}

/**
 * Límite de error de un bloque del panel: una consulta que falla (permiso,
 * red, BD) no tumba los demás bloques; `retry()` vuelve a pedir solo este
 * contenido al servidor dentro de una transición.
 */
export const LimiteErrorBloque = catchError(
  (props: PropsLimite, info: ErrorInfo) => <AvisoFalla {...props} {...info} />
)
