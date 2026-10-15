/**
 * TOTP (RFC 6238, HMAC-SHA1, 6 dígitos, pasos de 30 s) sin dependencias: lo usan
 * el script de usuarios E2E (verificar el factor recién enrolado) y las pruebas
 * E2E (el código de la verificación en dos pasos del administrador).
 */
import { createHmac } from "node:crypto"

const ALFABETO_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
export const PASO_TOTP_SEGUNDOS = 30
const DIGITOS = 6

/** Decodifica base32 (RFC 4648) ignorando espacios, guiones y relleno `=`. */
export function decodificarBase32(texto: string): Buffer {
  const limpio = texto.replace(/[\s=-]/g, "").toUpperCase()
  let bits = 0
  let acumulado = 0
  const bytes: number[] = []
  for (const caracter of limpio) {
    const valor = ALFABETO_BASE32.indexOf(caracter)
    if (valor === -1) throw new Error("La clave TOTP no es base32 válido.")
    acumulado = (acumulado << 5) | valor
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes.push((acumulado >>> bits) & 0xff)
    }
  }
  return Buffer.from(bytes)
}

/** HOTP (RFC 4226) con el contador dado. */
export function codigoHotp(
  clave: Buffer,
  contador: number,
  digitos = DIGITOS
): string {
  const mensaje = Buffer.alloc(8)
  mensaje.writeBigUInt64BE(BigInt(contador))
  const hmac = createHmac("sha1", clave).update(mensaje).digest()
  const desplazamiento = hmac[hmac.length - 1] & 0x0f
  const binario = hmac.readUInt32BE(desplazamiento) & 0x7fffffff
  return String(binario % 10 ** digitos).padStart(digitos, "0")
}

/** Código TOTP vigente en `instanteMs` para una clave en base32. */
export function codigoTotp(
  secretoBase32: string,
  instanteMs: number = Date.now(),
  digitos = DIGITOS
): string {
  const contador = Math.floor(instanteMs / 1000 / PASO_TOTP_SEGUNDOS)
  return codigoHotp(decodificarBase32(secretoBase32), contador, digitos)
}

/** Segundos que le quedan al código vigente antes de cambiar. */
export function segundosRestantesTotp(instanteMs: number = Date.now()): number {
  const transcurridos = Math.floor(instanteMs / 1000) % PASO_TOTP_SEGUNDOS
  return PASO_TOTP_SEGUNDOS - transcurridos
}
