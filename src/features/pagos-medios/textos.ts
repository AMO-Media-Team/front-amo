/**
 * Textos de los pagos a medios que dependen de cantidades y fechas (módulo
 * puro): resúmenes del archivo de pagos y el aviso de las que ya están en
 * otro archivo.
 */
import { formatearFechaCompacta } from "@/features/operacion/formato"
import { formatearCOP, formatearNumero } from "@/lib/format"

import type { PagosArchivoRegistrados, PedidoArchivo } from "./tipos"

/** Sin `usuarios.ver`, la RLS no deja leer el nombre de otra persona del equipo. */
export const SIN_NOMBRE_EQUIPO = "Otra persona del equipo"

/** «1 liquidación», «12 liquidaciones» (cifras con separador de miles). */
export function plural(
  cantidad: number,
  singular: string,
  varias: string
): string {
  return `${formatearNumero(cantidad)} ${cantidad === 1 ? singular : varias}`
}

/** «3 liquidaciones de 2 medios por $ 1.234.567». */
export function descripcionPedido(
  pedido: Pick<PedidoArchivo, "ids" | "medios" | "total">
): string {
  return `${plural(pedido.ids.length, "liquidación", "liquidaciones")} de ${plural(pedido.medios, "medio", "medios")} por ${formatearCOP(pedido.total)}`
}

/**
 * «Una ya está en el archivo de pagos del 18 oct 2026: confirma con tesorería
 * que el banco no la pagó antes de incluirla otra vez.»
 */
export function avisoYaEnArchivo(
  pedido: Pick<PedidoArchivo, "yaEnArchivo">
): string {
  const cantidad = pedido.yaEnArchivo.length
  const una = cantidad === 1
  const fechas = [
    ...new Set(
      pedido.yaEnArchivo.map((fila) =>
        formatearFechaCompacta(fila.dispersadaAt)
      )
    ),
  ]
  const donde =
    fechas.length === 1
      ? `el archivo de pagos del ${fechas[0]}`
      : `archivos de pagos anteriores (${fechas.slice(0, 3).join(", ")}${fechas.length > 3 ? "…" : ""})`
  const pronombre = una ? "la" : "las"
  return `${una ? "Una" : formatearNumero(cantidad)} ya ${una ? "está" : "están"} en ${donde}: confirma con tesorería que el banco no ${pronombre} pagó antes de incluir${pronombre} otra vez.`
}

/** Título de un archivo de pagos; también nombra la última miga («Archivo del 18 oct 2026»). */
export function tituloDispersion(creadaAt: string): string {
  return `Archivo del ${formatearFechaCompacta(creadaAt)}`
}

/**
 * Lo que no se pudo registrar al pagar un archivo (`null` si todo quedó):
 * «Registramos 2 de 3 pagos. No pudimos registrar: Radio X (motivo).».
 */
export function avisoPagosArchivo({
  registradas,
  fallidas,
}: PagosArchivoRegistrados): string | null {
  if (fallidas.length === 0) return null
  const total = registradas.length + fallidas.length
  const inicio =
    registradas.length > 0
      ? `Registramos ${formatearNumero(registradas.length)} de ${plural(total, "pago", "pagos")}.`
      : "No registramos ningún pago."
  const detalle = fallidas
    .slice(0, 5)
    .map((fila) => `${fila.medio} (${fila.mensaje.replace(/\.$/, "")})`)
    .join("; ")
  const resto =
    fallidas.length > 5 ? ` y ${formatearNumero(fallidas.length - 5)} más` : ""
  return `${inicio} No pudimos registrar: ${detalle}${resto}. Corrígelo y vuelve a intentarlo: el comprobante ya está cargado.`
}
