"use client"

import { createContext, use } from "react"

/**
 * La matriz informa cuántos cambios sin guardar tiene, para que la pestaña
 * "Permisos" lo indique aunque la persona esté mirando otra pestaña.
 */
export const ContextoCambiosRol = createContext<
  ((cambios: number) => void) | null
>(null)

const SIN_PESTANAS = () => {}

export function useInformarCambios(): (cambios: number) => void {
  return use(ContextoCambiosRol) ?? SIN_PESTANAS
}
