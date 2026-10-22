/**
 * STUB DEL LÍDER (fase 2): contrato del paquete E0, que lo implementa
 * conservando las firmas (docs/entregas-2-3/fase-2.md).
 */
import type { Page } from "@playwright/test"

export type CuentaAnunciante = "ANUNCIANTE" | "ANUNCIANTE_NUEVO"

/** «Anunciante E2E» (VERIFICADO) y «Anunciante Nuevo E2E» (PENDIENTE). */
export const ANUNCIANTE_E2E = {
  id: "e2e00000-0000-4000-8000-00000000a001",
  nombre: "Anunciante E2E",
} as const

export async function ingresarComoAnunciante(
  _page: Page,
  _opciones: { cuenta?: CuentaAnunciante; destino?: string } = {}
): Promise<void> {
  throw new Error("Pendiente del paquete E0.")
}

export async function restablecerAnuncianteNuevoE2E(): Promise<void> {
  throw new Error("Pendiente del paquete E0.")
}

/** RUT y Cámara PENDIENTE con archivos reales y la empresa enviada a verificación. */
export async function prepararAnuncianteEnVerificacion(): Promise<{
  anuncianteId: string
  nombre: string
}> {
  throw new Error("Pendiente del paquete E0.")
}
