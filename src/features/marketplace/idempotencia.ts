/**
 * Clave de idempotencia de la aceptación (MED-010, CUP-006), módulo puro.
 *
 * Regla: una clave NUEVA por intento (al pintar el detalle y después de cada
 * respuesta firme de la BD) y la MISMA en un reintento por red. Así un doble
 * toque o una respuesta que no llegó nunca toman dos cupos (la BD devuelve la
 * asignación que ya creó con esa clave), y una clave ya gastada en un intento
 * fallido o en una asignación desistida no se reusa (`AMO_IDEMPOTENCIA_INVALIDA`).
 */
import type { ResultadoAceptar } from "./tipos"

type FuenteAleatoria = Partial<Pick<Crypto, "randomUUID" | "getRandomValues">>

const HEX = Array.from({ length: 256 }, (_, byte) =>
  byte.toString(16).padStart(2, "0")
)

function bytesAleatorios(fuente: FuenteAleatoria): Uint8Array {
  const bytes = new Uint8Array(16)
  if (fuente.getRandomValues) return fuente.getRandomValues(bytes)
  for (let indice = 0; indice < bytes.length; indice += 1) {
    bytes[indice] = Math.floor(Math.random() * 256)
  }
  return bytes
}

/** UUID v4 a partir de 16 bytes aleatorios (RFC 9562 §5.4). */
export function uuidDeBytes(bytes: Uint8Array): string {
  const b = Uint8Array.from(bytes)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (byte) => HEX[byte])
  return [
    h.slice(0, 4).join(""),
    h.slice(4, 6).join(""),
    h.slice(6, 8).join(""),
    h.slice(8, 10).join(""),
    h.slice(10, 16).join(""),
  ].join("-")
}

/**
 * Clave nueva. `crypto.randomUUID` solo existe en contextos seguros (HTTPS o
 * localhost): al probar desde el celular por la IP de la red local no está, y
 * se arma igual con `getRandomValues`.
 */
export function nuevaClaveIdempotencia(
  fuente: FuenteAleatoria = globalThis.crypto ?? {}
): string {
  if (typeof fuente.randomUUID === "function") return fuente.randomUUID()
  return uuidDeBytes(bytesAleatorios(fuente))
}

/**
 * ¿El próximo intento debe usar otra clave? Sí tras una respuesta firme de la
 * BD (éxito o regla de negocio); no si la respuesta no llegó (`null`: falló
 * la red) o si el servidor falló sin saber si la reserva se hizo.
 */
export function debeRenovarClave(resultado: ResultadoAceptar | null): boolean {
  if (resultado === null) return false
  return resultado.ok || resultado.definitivo
}
