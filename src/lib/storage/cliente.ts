import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Lo único que estas utilidades necesitan de un cliente de Supabase: su
 * Storage. Sirve el de sesión (`crearClienteServidor`, aplica la RLS de
 * `storage.objects`) y el de servicio (`crearClienteAdmin`, sin RLS: solo tras
 * autorizar y leer la fila con la sesión, regla de firma 2 de §8).
 */
export type ClienteStorage = Pick<SupabaseClient, "storage">

/** Log de servidor sin datos personales: operación y código del fallo. */
export function informarStorage(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object"
      ? ("statusCode" in error && error.statusCode) ||
        ("status" in error && error.status) ||
        ("name" in error && error.name)
      : null
  console.error(
    `[storage] ${operacion} falló (${String(codigo ?? "desconocido")})`
  )
}

/** Estado HTTP de un error de storage-js, si lo trae. */
export function estadoDeError(error: unknown): number | null {
  if (!error || typeof error !== "object") return null
  for (const clave of ["status", "statusCode"] as const) {
    if (clave in error) {
      const valor = Number((error as Record<string, unknown>)[clave])
      if (Number.isInteger(valor) && valor >= 100) return valor
    }
  }
  return null
}
