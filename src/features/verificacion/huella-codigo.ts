import "server-only"

/**
 * Compara el código que se ve en la captura con `verificaciones_cuenta.codigo_hash`
 * (sha256 en hex del código generado). Comparación en tiempo constante.
 */
import { createHash, timingSafeEqual } from "node:crypto"

import { esHuellaHex, variantesCodigo } from "./codigo"

function sha256(texto: string): Buffer {
  return createHash("sha256").update(texto, "utf8").digest()
}

export function coincideCodigo(codigo: string, huellaHex: string): boolean {
  if (!esHuellaHex(huellaHex)) return false
  const esperada = Buffer.from(huellaHex, "hex")
  return variantesCodigo(codigo).some((variante) =>
    timingSafeEqual(sha256(variante), esperada)
  )
}
