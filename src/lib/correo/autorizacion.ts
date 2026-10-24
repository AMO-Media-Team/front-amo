import "server-only"

import { createHash, timingSafeEqual } from "node:crypto"

function digesto(valor: string): Buffer {
  return createHash("sha256").update(valor, "utf8").digest()
}

/**
 * `Authorization: Bearer <secreto>` del job `amo_correos`. Compara los SHA-256
 * en tiempo constante: ni el contenido ni la longitud del secreto se filtran
 * por el tiempo de respuesta. El esquema no distingue mayúsculas.
 */
export function despachadorAutorizado(
  cabecera: string | null,
  secreto: string
): boolean {
  const coincidencia = /^Bearer\s+(\S+)\s*$/i.exec(cabecera ?? "")
  if (!coincidencia) return false
  return timingSafeEqual(digesto(coincidencia[1]), digesto(secreto))
}
