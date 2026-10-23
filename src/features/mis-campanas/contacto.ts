/**
 * El canal de contacto con el equipo AMO (módulo puro, D74): el correo de
 * `soporte.correo` solo se muestra si tiene un valor que parece un correo. Sin
 * él, la interfaz no le pide al medio que «le escriba al equipo AMO» sin
 * decirle dónde: lo lleva a la página de la disputa o no dice nada.
 */
import type { Json } from "@/types/database.types"

const PARECE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** El correo de la configuración (texto JSON); `null` si está vacío o no es un correo. */
export function correoDeConfiguracion(valor: Json | undefined): string | null {
  if (typeof valor !== "string") return null
  const correo = valor.trim()
  return PARECE_CORREO.test(correo) ? correo : null
}

/** «Si tienes dudas, escríbenos a soporte@amo.co.»; vacío sin correo. */
export function textoContacto(
  correo: string | null,
  inicio = "Si tienes dudas"
): string {
  return correo ? `${inicio}, escríbenos a ${correo}.` : ""
}
