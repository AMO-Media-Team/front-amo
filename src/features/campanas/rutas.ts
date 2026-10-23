/**
 * Rutas del portal de campañas del anunciante (módulo puro). Las fichas de
 * campaña y de oferta son contrato con `/ir/[entidad]/[id]` (enlaces de las
 * notificaciones): `/campanas/{id}` y `/campanas/{campanaId}/ofertas/{id}`
 * (esta la construye `rutaOfertaAnunciante` de `ofertas/rutas`).
 */
import type { Route } from "next"

import { estadoTablaMisCampanas } from "./estado-tabla"
import type { EstadoCampana } from "./tipos"

export const RUTA_MIS_CAMPANAS = "/campanas" satisfies Route

export const RUTA_NUEVA_CAMPANA = "/campanas/nueva" satisfies Route

/** Pestañas de la ficha de una campaña (`?pestana=`; la primera no ocupa la URL). */
export const PESTANAS_CAMPANA = ["ofertas", "datos"] as const

export type PestanaCampana = (typeof PESTANAS_CAMPANA)[number]

export function rutaMiCampana(id: string, pestana?: PestanaCampana): Route {
  const base = `${RUTA_MIS_CAMPANAS}/${encodeURIComponent(id)}`
  return (pestana ? `${base}?pestana=${pestana}` : base) as Route
}

export function rutaEditarCampana(id: string): Route {
  return `${RUTA_MIS_CAMPANAS}/${encodeURIComponent(id)}/editar` as Route
}

/** Listado ya filtrado por estado (`?estado=ACTIVA`), con el parser de la tabla. */
export function rutaMisCampanasEn(estado: EstadoCampana): Route {
  return estadoTablaMisCampanas.serializar(RUTA_MIS_CAMPANAS, {
    estado: [estado],
  }) as Route
}

/** «Mi empresa» del anunciante (paquete EM). */
export const RUTA_MI_EMPRESA = "/empresa" as Route
