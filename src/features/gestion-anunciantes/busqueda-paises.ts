/**
 * Búsqueda de países en el selector (módulo puro): por nombre en español sin
 * acentos ni mayúsculas, o por código ISO alfa-2. Primero los que empiezan
 * por lo escrito.
 */
import { normalizarNombreGeo } from "@/lib/geo/normalizar"

import type { OpcionPais } from "./tipos"

export function filtrarPaises(
  paises: readonly OpcionPais[],
  texto: string
): readonly OpcionPais[] {
  const consulta = normalizarNombreGeo(texto)
  if (!consulta) return paises
  const codigo = texto.trim().toUpperCase()
  const puntuados: { pais: OpcionPais; puntaje: number }[] = []
  for (const pais of paises) {
    if (pais.iso2 === codigo) {
      puntuados.push({ pais, puntaje: 0 })
      continue
    }
    const indice = normalizarNombreGeo(pais.nombre).indexOf(consulta)
    if (indice === 0) puntuados.push({ pais, puntaje: 1 })
    else if (indice > 0) puntuados.push({ pais, puntaje: 2 })
  }
  // `sort` es estable: dentro de cada puntaje se conserva el orden alfabético.
  return puntuados.sort((a, b) => a.puntaje - b.puntaje).map(({ pais }) => pais)
}
