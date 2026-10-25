/**
 * Rutas de los derechos del titular de datos (CTA-007): la sección propia en
 * Cuenta y la bandeja del equipo en Administración. Contrato de la fase 6.
 */
import type { Route } from "next"

export const RUTA_PRIVACIDAD_CUENTA = "/cuenta/privacidad" as Route
export const RUTA_PRIVACIDAD_ADMIN = "/administracion/privacidad" as Route

/** La solicitud propia del titular, abierta en su sección de Cuenta. */
export function rutaSolicitudPropia(id: string): Route {
  return `/cuenta/privacidad?solicitud=${id}` as Route
}

/** Ficha de una solicitud en la bandeja del equipo. */
export function rutaSolicitudAdmin(id: string): Route {
  return `/administracion/privacidad/${id}` as Route
}
