/**
 * Huella de la conexión que envía una solicitud de vinculación: la BD limita
 * cuántas acepta por conexión en 24 horas (`vinculacion.max_solicitudes_ip_dia`)
 * sin guardar la IP, solo un HMAC-SHA256 con `AMO_SERVIDOR_SECRET` como sal.
 *
 * Una conexión IPv6 suele tener una red /64 entera (el teléfono cambia de
 * dirección dentro de ella): se cuenta por red, no por dirección. Módulo puro
 * (solo `node:crypto` y `node:net`).
 */
import { createHmac } from "node:crypto"
import { isIP } from "node:net"

const GRUPOS_IPV6 = 8
const GRUPOS_RED_IPV6 = 4

/** Dos grupos hexadecimales a partir de la IPv4 incrustada al final de una IPv6. */
function gruposDeIpv4(ipv4: string): string[] {
  const [a, b, c, d] = ipv4.split(".").map(Number)
  return [((a << 8) | b).toString(16), ((c << 8) | d).toString(16)]
}

/** Los 8 grupos de una IPv6 válida, de 4 dígitos y en minúsculas. */
export function expandirIpv6(ip: string): string[] {
  const [cabeza, cola] = ip.split("::")
  const trozos = (texto: string | undefined) =>
    texto
      ? texto
          .split(":")
          .flatMap((grupo) =>
            grupo.includes(".") ? gruposDeIpv4(grupo) : [grupo]
          )
      : []
  const izquierda = trozos(cabeza)
  const derecha = trozos(cola)
  const relleno =
    cola === undefined
      ? []
      : Array<string>(GRUPOS_IPV6 - izquierda.length - derecha.length).fill("0")
  return [...izquierda, ...relleno, ...derecha].map((grupo) =>
    grupo.padStart(4, "0").toLowerCase()
  )
}

/**
 * Clave de la conexión para el límite: la IPv4 tal cual (también la que
 * llega como IPv6 mapeada, `::ffff:1.2.3.4`) o la red /64 de una IPv6.
 * `null` si no es una IP válida.
 */
export function claveConexion(ip: string | null | undefined): string | null {
  const limpia = ip?.trim().replace(/%.*$/, "") ?? ""
  const version = isIP(limpia)
  if (version === 4) return limpia
  if (version !== 6) return null
  const grupos = expandirIpv6(limpia)
  const mapeada =
    grupos.slice(0, 5).every((grupo) => grupo === "0000") &&
    grupos[5] === "ffff"
  if (mapeada) {
    return [grupos[6], grupos[7]]
      .flatMap((grupo) => [
        Number.parseInt(grupo.slice(0, 2), 16),
        Number.parseInt(grupo.slice(2), 16),
      ])
      .join(".")
  }
  return `${grupos.slice(0, GRUPOS_RED_IPV6).join(":")}::/64`
}

/** HMAC-SHA256 hex (64) de la conexión; `null` sin una IP válida (sin límite). */
export function huellaConexion(
  ip: string | null | undefined,
  secreto: string
): string | null {
  const clave = claveConexion(ip)
  if (!clave) return null
  return createHmac("sha256", secreto)
    .update(`amo:vinculacion:${clave}`, "utf8")
    .digest("hex")
}
