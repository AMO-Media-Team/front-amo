/**
 * Comprobación del código temporal de una verificación por historia
 * (MED-005), módulo puro. La BD solo guarda el sha256 (hex) del código que
 * vio el medio; quien revisa escribe el que aparece en la captura y el
 * servidor compara huellas. Se prueban las escrituras razonables del mismo
 * código (tal cual, en mayúsculas y sin separadores) para no depender de cómo
 * lo formatee la pantalla del medio («AB3-K9P» o «AB3K9P»).
 */

export const LARGO_MINIMO_CODIGO = 4
export const LARGO_MAXIMO_CODIGO = 16

const SEPARADORES = /[\s\-_.·]+/g

/** Escrituras candidatas del código, sin repetir y en orden de preferencia. */
export function variantesCodigo(texto: string): string[] {
  const recortado = texto.trim()
  if (!recortado) return []
  const mayusculas = recortado.toLocaleUpperCase("es-CO")
  const compacto = mayusculas.replace(SEPARADORES, "")
  return [...new Set([recortado, mayusculas, compacto])].filter(Boolean)
}

/** sha256 en hex de 64 caracteres (como `codigo_hash`). */
export function esHuellaHex(
  valor: string | null | undefined
): valor is string {
  return typeof valor === "string" && /^[0-9a-f]{64}$/.test(valor)
}
