/**
 * Datos de red de la bitácora y de los accesos. La IP completa solo la ve
 * quien tiene `datos_sensibles.ver`; al resto le llega enmascarada DESDE EL
 * SERVIDOR (nunca se envía completa al navegador para ocultarla allí).
 */
const OCULTO = "•••"
const OCTETO = "(25[0-5]|2[0-4]\\d|1?\\d?\\d)"
const IPV4 = new RegExp(`^${OCTETO}(\\.${OCTETO}){3}$`)

/**
 * IPv4 conserva los dos primeros octetos (red del proveedor, útil para
 * correlacionar) y IPv6 los dos primeros grupos: `181.52.•••.•••`, `2800:e2:•••`.
 */
export function enmascararIp(ip: string | null): string | null {
  if (!ip) return null
  const limpia = ip.trim().replace(/\/\d+$/, "")
  if (IPV4.test(limpia)) {
    const [a, b] = limpia.split(".")
    return `${a}.${b}.${OCULTO}.${OCULTO}`
  }
  const grupos = limpia.split(":").filter(Boolean)
  if (limpia.includes(":") && grupos.length >= 2) {
    return `${grupos[0]}:${grupos[1]}:${OCULTO}`
  }
  return OCULTO
}

/** IP para la interfaz: completa con permiso, enmascarada sin él. */
export function ipVisible(ip: unknown, completa: boolean): string | null {
  if (typeof ip !== "string" || ip.trim() === "") return null
  const limpia = ip.trim().replace(/\/(32|128)$/, "")
  return completa ? limpia : enmascararIp(limpia)
}
