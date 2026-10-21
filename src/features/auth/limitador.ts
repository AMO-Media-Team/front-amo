/**
 * Claves del limitador de intentos de Postgres (`login_bloqueado_srv` y
 * `registrar_intento_login_srv`, docs/modelo-datos.md §5.5). La BD cuenta
 * fallos por clave, por (clave, IP) y por IP, y guarda solo el SHA-256 de la
 * clave. Cada flujo usa su propio espacio de nombres para que, por ejemplo,
 * ingresar con la contraseña correcta no reinicie los fallos del código MFA.
 * Módulo puro: se prueba sin servidor.
 */

export type FlujoLimitado = "ingreso" | "mfa" | "recuperacion"

/**
 * @param identificador El correo (ingreso y recuperación) o el id del usuario
 *   (MFA: el correo de la sesión puede faltar en los claims).
 */
export function claveLimitador(
  flujo: FlujoLimitado,
  identificador: string
): string {
  const normalizado = identificador.trim().toLowerCase()
  // El ingreso conserva el correo tal cual: es la clave que ya usan las filas existentes.
  return flujo === "ingreso" ? normalizado : `${flujo}:${normalizado}`
}
