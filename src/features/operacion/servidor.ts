import "server-only"

/**
 * Utilidades de servidor de las acciones de operación (no son acciones: no
 * llevan `"use server"`). Las lecturas privilegiadas van con el contexto del
 * actor (`@/lib/auth/contexto-actor`); la BD revalida actor, sesión y permiso.
 */

/** Log de servidor sin datos personales: operación y código. */
export function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[operacion] ${operacion} falló (${codigo})`)
}
