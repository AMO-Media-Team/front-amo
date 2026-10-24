"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Foco que espera a que termine una transición. Mientras `pendiente`, los
 * campos del formulario están deshabilitados y el navegador ignora `focus()`
 * sobre un control deshabilitado: el error del servidor se pinta enseguida,
 * pero el foco se aplica cuando los campos vuelven a habilitarse (como en
 * `dialogo-registrar-pago.tsx` de pagos-medios).
 *
 * Devuelve `diferir(enfocar)`: se llama dentro de la transición con lo que
 * debe recibir el foco; si se llama varias veces, gana la última. El contador
 * cubre la transición que termina sin llegar a pintar `pendiente = true`.
 */
export function useFocoDiferido(
  pendiente: boolean
): (enfocar: () => void) => void {
  const porEnfocar = useRef<(() => void) | null>(null)
  const [solicitud, setSolicitud] = useState(0)

  useEffect(() => {
    if (pendiente) return
    const enfocar = porEnfocar.current
    porEnfocar.current = null
    enfocar?.()
  }, [pendiente, solicitud])

  return useCallback((enfocar: () => void) => {
    porEnfocar.current = enfocar
    setSolicitud((actual) => actual + 1)
  }, [])
}
