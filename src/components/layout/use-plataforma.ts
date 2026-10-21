"use client"

import { useSyncExternalStore } from "react"

const sinSuscripcion = () => () => {}

function detectarApple(): boolean {
  const datos = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData
  const plataforma = datos?.platform ?? navigator.platform ?? ""
  return /mac|iphone|ipad|ipod/i.test(plataforma)
}

/**
 * `true` en macOS/iOS (atajos con ⌘ en lugar de Ctrl). En el servidor y
 * durante la hidratación se asume Ctrl; el cliente corrige sin desajustes.
 */
export function useEsApple(): boolean {
  return useSyncExternalStore(sinSuscripcion, detectarApple, () => false)
}
