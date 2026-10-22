/**
 * Tamaños y duraciones de archivo en es-CO para mensajes y listas. Los
 * límites de Storage se expresan en MiB (10 MB = 10 485 760 bytes), así que
 * «MB» aquí son múltiplos de 1024.
 */
import { formatearNumero } from "@/lib/format"

export const KIB = 1024
export const MIB = 1024 * KIB
const GIB = 1024 * MIB

/** Espacio duro: la cifra y su unidad no se separan al saltar de línea. */
const ESPACIO = " "

export type Redondeo = "cercano" | "arriba"

function redondear(valor: number, decimales: number, modo: Redondeo): number {
  const factor = 10 ** decimales
  return modo === "arriba"
    ? Math.ceil(valor * factor) / factor
    : Math.round(valor * factor) / factor
}

/**
 * «850 KB», «12,4 MB». Con `redondeo: "arriba"` un archivo que apenas supera
 * el límite no se muestra igual que el límite («10,1 MB», no «10 MB»).
 */
export function formatearTamano(
  bytes: number,
  redondeo: Redondeo = "cercano"
): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—"
  if (bytes < KIB) return `${formatearNumero(bytes)}${ESPACIO}bytes`
  if (bytes < MIB) {
    return `${formatearNumero(redondear(bytes / KIB, 0, redondeo))}${ESPACIO}KB`
  }
  if (bytes < GIB) {
    return `${formatearNumero(redondear(bytes / MIB, 1, redondeo), 1)}${ESPACIO}MB`
  }
  return `${formatearNumero(redondear(bytes / GIB, 1, redondeo), 1)}${ESPACIO}GB`
}

/** «45 s», «1 min 32 s», «2 min», «1 h 5 min». Redondea al segundo. */
export function formatearDuracion(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) return "—"
  const total = Math.round(segundos)
  const horas = Math.floor(total / 3600)
  const minutos = Math.floor((total % 3600) / 60)
  const resto = total % 60
  const partes =
    horas > 0
      ? [`${horas}${ESPACIO}h`, minutos > 0 ? `${minutos}${ESPACIO}min` : ""]
      : minutos > 0
        ? [`${minutos}${ESPACIO}min`, resto > 0 ? `${resto}${ESPACIO}s` : ""]
        : [`${resto}${ESPACIO}s`]
  return partes.filter(Boolean).join(" ")
}
