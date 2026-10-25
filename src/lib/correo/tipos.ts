import "server-only"

/**
 * Contrato del envío de correos de los avisos (NOT-004). El despachador
 * (`procesar.ts`) no sabe de proveedores: arma el mensaje y entrega el
 * resultado a la base de datos, que decide el reintento y el turno.
 */

export interface MensajeCorreo {
  para: string
  asunto: string
  html: string
  texto: string
  /**
   * La misma en cada reintento del mismo correo (`amo-correo-{id}`): el
   * proveedor descarta el duplicado si un intento anterior sí salió.
   */
  claveIdempotencia: string
}

/**
 * - `enviado`: el proveedor lo aceptó (`proveedorId`, si lo da).
 * - `reintentar`: falla pasajera (límite de tasa, 5xx, red, tiempo agotado);
 *   `pausar` pide no enviar más en esta corrida (el proveedor pidió esperar).
 * - `fallido`: el proveedor lo rechazó y repetirlo no cambiaría nada.
 *
 * `error` es un código corto sin datos personales (va a `ultimo_error`).
 */
export type ResultadoEnvio =
  | { estado: "enviado"; proveedorId: string | null }
  | { estado: "reintentar"; error: string; pausar?: boolean }
  | { estado: "fallido"; error: string }

export interface AdaptadorCorreo {
  readonly nombre: string
  enviar(mensaje: MensajeCorreo): Promise<ResultadoEnvio>
}

export function enviado(proveedorId: string | null = null): ResultadoEnvio {
  return { estado: "enviado", proveedorId }
}

export function reintentar(error: string, pausar = false): ResultadoEnvio {
  return pausar
    ? { estado: "reintentar", error, pausar }
    : { estado: "reintentar", error }
}

export function fallido(error: string): ResultadoEnvio {
  return { estado: "fallido", error }
}

/** Prefijo de la clave de idempotencia: `amo-correo-{id de la cola}`. */
export function claveIdempotencia(correoId: number): string {
  return `amo-correo-${correoId}`
}
