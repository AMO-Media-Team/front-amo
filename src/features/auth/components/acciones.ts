import type { ContratoAccionesAuth } from "../acciones-contrato"
import * as acciones from "../actions"

/**
 * Punto único desde el que las pantallas usan las Server Actions de auth.
 * La anotación hace que `pnpm typecheck` falle si una implementación se
 * aparta del contrato.
 */
export const ACCIONES_AUTH: ContratoAccionesAuth = acciones
