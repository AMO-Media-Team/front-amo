/**
 * Rankings de países y ciudades de los ingresos exitosos (módulo puro), a
 * partir de la muestra del periodo. Lo que no cabe en el top se resume en
 * "Otros" para que las proporciones sumen el total.
 */
import { contarPor } from "@/features/auditoria/agregados"

import { banderaEmoji } from "./catalogo"
import type { ElementoRanking } from "./tipos"

export interface UbicacionMuestra {
  pais_iso2: string | null
  municipio_codigo: string | null
  ciudad: string | null
}

export interface Nombradores {
  pais: (iso2: string) => string | null
  /** Municipio DIVIPOLA → nombre y departamento. */
  municipio: (
    codigo: string
  ) => { nombre: string; departamento: string | null } | null
}

const LIMITE_POR_DEFECTO = 6

function proporcion(cantidad: number, total: number): number {
  return total > 0 ? cantidad / total : 0
}

function conOtros(
  elementos: ElementoRanking[],
  total: number,
  limite: number
): ElementoRanking[] {
  if (elementos.length <= limite) return elementos
  const visibles = elementos.slice(0, limite - 1)
  const resto = elementos
    .slice(limite - 1)
    .reduce((suma, e) => suma + e.cantidad, 0)
  return [
    ...visibles,
    {
      clave: "__otros__",
      etiqueta: "Otros",
      detalle: `${elementos.length - visibles.length} más`,
      iso2: null,
      bandera: null,
      cantidad: resto,
      proporcion: proporcion(resto, total),
    },
  ]
}

export function rankingPaises(
  filas: readonly UbicacionMuestra[],
  nombrar: Nombradores,
  limite = LIMITE_POR_DEFECTO
): ElementoRanking[] {
  const conPais = filas.filter((fila) => fila.pais_iso2)
  const total = conPais.length
  const elementos = contarPor(conPais, (fila) =>
    fila.pais_iso2?.toUpperCase()
  ).map(({ clave, cantidad }) => ({
    clave,
    etiqueta: nombrar.pais(clave) ?? clave,
    detalle: clave,
    iso2: clave,
    bandera: banderaEmoji(clave),
    cantidad,
    proporcion: proporcion(cantidad, total),
  }))
  return conOtros(elementos, total, limite)
}

/** Ciudad por municipio resuelto (Colombia) o, si no, por el texto crudo y el país. */
function claveCiudad(fila: UbicacionMuestra): string | null {
  if (fila.municipio_codigo) return `m:${fila.municipio_codigo}`
  const ciudad = fila.ciudad?.trim()
  if (!ciudad) return null
  return `t:${fila.pais_iso2 ?? "??"}:${ciudad.toLocaleLowerCase("es-CO")}`
}

export function rankingCiudades(
  filas: readonly UbicacionMuestra[],
  nombrar: Nombradores,
  limite = LIMITE_POR_DEFECTO
): ElementoRanking[] {
  const ejemplo = new Map<string, UbicacionMuestra>()
  for (const fila of filas) {
    const clave = claveCiudad(fila)
    if (clave && !ejemplo.has(clave)) ejemplo.set(clave, fila)
  }
  const conCiudad = filas.filter((fila) => claveCiudad(fila) !== null)
  const total = conCiudad.length
  const elementos = contarPor(conCiudad, claveCiudad).map(
    ({ clave, cantidad }) => {
      const fila = ejemplo.get(clave) as UbicacionMuestra
      const municipio = fila.municipio_codigo
        ? nombrar.municipio(fila.municipio_codigo)
        : null
      const pais = fila.pais_iso2
        ? (nombrar.pais(fila.pais_iso2) ?? fila.pais_iso2)
        : null
      return {
        clave,
        etiqueta: municipio?.nombre ?? fila.ciudad?.trim() ?? "—",
        detalle: municipio?.departamento ?? pais,
        iso2: fila.pais_iso2?.toUpperCase() ?? null,
        bandera: banderaEmoji(fila.pais_iso2),
        cantidad,
        proporcion: proporcion(cantidad, total),
      }
    }
  )
  return conOtros(elementos, total, limite)
}
