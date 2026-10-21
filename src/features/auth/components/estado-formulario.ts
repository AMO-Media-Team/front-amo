"use client"

import { useEffect } from "react"

import { RUTA_INICIO, rutaInternaSegura } from "@/lib/auth/navegacion"

import type { EstadoFormulario } from "../acciones-contrato"

/** Primer mensaje de error de un campo, si la acción lo devolvió. */
export function errorDeCampo(
  estado: EstadoFormulario,
  campo: string
): string | undefined {
  return estado && !estado.ok ? estado.erroresCampo?.[campo]?.[0] : undefined
}

export function errorGeneral(estado: EstadoFormulario): string | undefined {
  return estado && !estado.ok ? estado.error : undefined
}

/**
 * Tras un éxito con `redirigirA`, navega con recarga completa: la sesión
 * cambió y el AppShell debe montarse limpio (sin estado cliente del flujo de
 * acceso). El destino se revalida: nunca se sigue una URL externa.
 */
export function useNavegarTrasExito(estado: EstadoFormulario) {
  const destino = estado?.ok ? estado.datos.redirigirA : undefined

  useEffect(() => {
    if (destino)
      window.location.assign(rutaInternaSegura(destino) ?? RUTA_INICIO)
  }, [destino])
}
