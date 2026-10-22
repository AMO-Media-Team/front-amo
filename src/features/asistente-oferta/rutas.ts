import type { Route } from "next"

/**
 * STUB DEL LÍDER (fase 2): el paquete AO lo conserva o lo amplía. Asistente
 * para una oferta nueva de la campaña o para editar una existente.
 */
export function rutaAsistente(campanaId: string, ofertaId?: string): Route {
  return (
    ofertaId
      ? `/campanas/${campanaId}/ofertas/${ofertaId}/editar`
      : `/campanas/${campanaId}/ofertas/nueva`
  ) as Route
}
