import "server-only"

import { type EnvServidor, validarEnvServidor } from "./env-esquema"

let envServidor: EnvServidor | undefined

/**
 * Secretos de servidor validados (memoizado por proceso). Se lee en tiempo de
 * ejecución, no en la carga del módulo, para no exigir secretos a código que
 * solo importa tipos o se evalúa durante el build.
 */
export function getEnvServidor(): EnvServidor {
  envServidor ??= validarEnvServidor(process.env)
  return envServidor
}
