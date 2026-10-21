/**
 * Países con datos pero sin polígono en `paises.json` (Natural Earth 1:110m
 * omite microestados e islas pequeñas): el mapa los dibuja como círculos
 * proporcionales en su centroide. Usa el catálogo completo de países, así que
 * solo se importa en el servidor y en pruebas.
 */
import { obtenerPais } from "@/lib/geo/catalogo"

import type { NivelGeo } from "./metricas"
import type { CentroZona, FilaMetricaGeo } from "./tipos"

export function centrosSinPoligono(
  nivel: NivelGeo,
  filas: readonly FilaMetricaGeo[]
): CentroZona[] {
  if (nivel !== "internacional") return []
  const vistos = new Set<string>()
  return filas.flatMap((fila) => {
    const pais = obtenerPais(fila.codigoGeometria)
    if (!pais || pais.conGeometria || vistos.has(pais.iso2)) return []
    vistos.add(pais.iso2)
    return [{ codigo: pais.iso2, centro: pais.centroide }]
  })
}
