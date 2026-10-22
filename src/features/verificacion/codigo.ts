/**
 * Código temporal de una verificación por historia (MED-005), módulo puro
 * (cliente y servidor). La BD solo guarda el sha256 (hex) del código que vio
 * el medio; quien revisa escribe el que aparece en la captura y el servidor
 * lo compara con `codigoCoincide` de «Mi medio › Cuentas sociales», la misma
 * normalización con que se generó la huella (una sola fuente de verdad). Aquí
 * quedan los límites del campo y si la captura llegó a tiempo.
 */

/** Límites del campo donde se escribe el código («K7P 4XQ», «k7p-4xq»…). */
export const LARGO_MINIMO_CODIGO = 4
export const LARGO_MAXIMO_CODIGO = 16

/** sha256 en hex de 64 caracteres (como `codigo_hash`). */
export function esHuellaHex(valor: string | null | undefined): valor is string {
  return typeof valor === "string" && /^[0-9a-f]{64}$/.test(valor)
}

export interface MomentoCaptura {
  /** La captura llegó antes de que venciera el código (la BD lo exige al aprobar). */
  aTiempo: boolean
  /** Minutos entre la carga y el vencimiento (positivo = antes). */
  margenMinutos: number
}

/**
 * ¿Se cargó la captura antes de que venciera el código? Compara las mismas
 * columnas que `private.validar_condicion_transicion` (`updated_at` frente a
 * `codigo_expira_at`). `null` si la verificación no usa código.
 */
export function momentoCaptura(
  cargadaAt: string,
  expiraAt: string | null
): MomentoCaptura | null {
  if (!expiraAt) return null
  const carga = Date.parse(cargadaAt)
  const vence = Date.parse(expiraAt)
  if (Number.isNaN(carga) || Number.isNaN(vence)) return null
  return {
    aTiempo: carga <= vence,
    margenMinutos: Math.trunc((vence - carga) / 60_000),
  }
}
