import "server-only"

/**
 * Código temporal de la verificación por historia (MED-005, método
 * CODIGO_HISTORIA). El servidor lo genera, guarda solo su huella
 * (`verificaciones_cuenta.codigo_hash`, sha256 en hex de la forma normalizada)
 * y lo muestra UNA vez al medio, que lo publica en una historia de la cuenta.
 * Quien verifica escribe lo que ve en la captura y lo compara con
 * `codigoCoincide`: así la BD nunca guarda el código en claro.
 *
 * El código no es un secreto frente al medio (lo publica él mismo): prueba que
 * quien lo pidió controla la cuenta, porque solo el dueño puede publicar ahí.
 */
import { createHash, timingSafeEqual } from "node:crypto"

/** Sin 0/O, 1/I/L ni otras letras que se confunden al escribirlas en una historia. */
export const ALFABETO_CODIGO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
export const LARGO_CODIGO = 6

/** Mayor múltiplo del alfabeto que cabe en un byte: evita el sesgo del módulo. */
const LIMITE_BYTE =
  Math.floor(256 / ALFABETO_CODIGO.length) * ALFABETO_CODIGO.length

export type FuenteAleatoria = (cantidad: number) => Uint8Array

const aleatorioSeguro: FuenteAleatoria = (cantidad) =>
  crypto.getRandomValues(new Uint8Array(cantidad))

/** Código legible de `LARGO_CODIGO` caracteres (p. ej. «K7P4XQ»). */
export function generarCodigo(
  aleatorio: FuenteAleatoria = aleatorioSeguro
): string {
  let codigo = ""
  while (codigo.length < LARGO_CODIGO) {
    for (const byte of aleatorio(LARGO_CODIGO * 2)) {
      if (byte >= LIMITE_BYTE) continue
      codigo += ALFABETO_CODIGO[byte % ALFABETO_CODIGO.length]
      if (codigo.length === LARGO_CODIGO) break
    }
  }
  return codigo
}

/** Como se compara: mayúsculas, sin espacios, guiones ni puntos. */
export function normalizarCodigo(texto: string): string {
  return texto.toUpperCase().replace(/[\s.\-_]/g, "")
}

/** sha256 en hex de la forma normalizada (`verificaciones_cuenta_codigo_hash_chk`). */
export function huellaCodigo(codigo: string): string {
  return createHash("sha256").update(normalizarCodigo(codigo)).digest("hex")
}

/** ¿Lo que se lee en la captura es el código cuya huella se guardó? */
export function codigoCoincide(texto: string, huella: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(huella)) return false
  const calculada = Buffer.from(huellaCodigo(texto), "hex")
  return timingSafeEqual(calculada, Buffer.from(huella, "hex"))
}

/** Vencimiento de un código generado en `ahora` con la vigencia configurada. */
export function vencimientoCodigo(ahora: Date, minutos: number): Date {
  return new Date(ahora.getTime() + minutos * 60_000)
}
