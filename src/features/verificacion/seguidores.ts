/**
 * Ayudas para verificar seguidores (módulo puro): variación frente a la última
 * verificación aprobada (los saltos bruscos delatan seguidores comprados,
 * EP §7.1.1) y lectura de la cifra que se escribe. La franja en la que
 * quedaría la cuenta la calcula `franjaPara` de `@/features/cuentas-medio/franjas`.
 */

/**
 * Variación (en valor absoluto) desde la que se resalta un salto de
 * seguidores. Es solo una ayuda visual para quien revisa: la decisión es
 * suya. Decisión asumida, pendiente de validar con el cliente.
 */
export const UMBRAL_SALTO_SEGUIDORES = 0.2

export interface VariacionSeguidores {
  /** Cambio relativo (0,25 = +25 %); `null` sin verificación anterior. */
  fraccion: number | null
  diferencia: number | null
  salto: boolean
}

export function variacionSeguidores(
  nuevos: number,
  anteriores: number | null
): VariacionSeguidores {
  if (anteriores === null || anteriores <= 0 || !Number.isFinite(nuevos)) {
    return { fraccion: null, diferencia: null, salto: false }
  }
  const fraccion = (nuevos - anteriores) / anteriores
  return {
    fraccion,
    diferencia: nuevos - anteriores,
    salto: Math.abs(fraccion) >= UMBRAL_SALTO_SEGUIDORES,
  }
}

/** Entero de seguidores desde lo que se escribe («58.000», «58000»). */
export function parsearSeguidores(texto: string): number | null {
  const limpio = texto.replace(/[\s.,]/g, "")
  if (!/^\d{1,10}$/.test(limpio)) return null
  return Number(limpio)
}
