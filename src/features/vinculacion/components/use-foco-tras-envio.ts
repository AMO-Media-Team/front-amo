"use client"

import { useCallback, useEffect, useRef } from "react"

/**
 * Mientras se envía un formulario sus campos están deshabilitados y no
 * aceptan el foco: el foco del primer error que devuelve el servidor se
 * aplica cuando el envío termina. Devuelve la función que lo programa.
 */
export function useFocoTrasEnvio<Campo extends string>(
  pendiente: boolean,
  enfocar: (campo: Campo) => void
): (campo: Campo | null) => void {
  const programado = useRef<Campo | null>(null)

  useEffect(() => {
    if (pendiente || !programado.current) return
    const campo = programado.current
    programado.current = null
    enfocar(campo)
  }, [pendiente, enfocar])

  return useCallback((campo: Campo | null) => {
    programado.current = campo
  }, [])
}
