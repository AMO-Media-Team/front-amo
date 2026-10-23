/**
 * Ruta de la pestaña «Seguimiento» de una campaña (módulo puro). Es contrato
 * con `/ir/[entidad]/[id]`: el aviso de una asignación lleva al anunciante a
 * `/campanas/{campana}?pestana=seguimiento&asignacion={id}`.
 */
import type { Route } from "next"

import { rutaMiCampana } from "@/features/campanas/rutas"

/** Parámetro de la URL con la asignación que se abre y destaca. */
export const PARAMETRO_ASIGNACION = "asignacion"

export function rutaSeguimiento(
  campanaId: string,
  asignacionId?: string
): Route {
  const base = rutaMiCampana(campanaId, "seguimiento")
  return (
    asignacionId
      ? `${base}&${PARAMETRO_ASIGNACION}=${encodeURIComponent(asignacionId)}`
      : base
  ) as Route
}

/**
 * `id` del título del panel (con `tabIndex={-1}`): recibe el foco al llegar
 * desde «Ver el seguimiento» de la pestaña «Métricas».
 */
export const ID_TITULO_SEGUIMIENTO = "titulo-seguimiento"

/** `id` del elemento de la tarjeta (ancla para desplazarse a ella). */
export function idTarjetaAsignacion(asignacionId: string): string {
  return `asignacion-${asignacionId}`
}
