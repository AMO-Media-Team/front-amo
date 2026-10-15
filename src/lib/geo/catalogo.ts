import { DEPARTAMENTOS } from "./diccionarios/departamentos"
import { MUNICIPIOS } from "./diccionarios/municipios"
import { PAISES } from "./diccionarios/paises"
import type { Departamento, Municipio, Pais } from "./tipos"

/** Índice perezoso: se construye la primera vez que se consulta. */
function indicePerezoso<K, V>(construir: () => Map<K, V>): () => Map<K, V> {
  let indice: Map<K, V> | undefined
  return () => (indice ??= construir())
}

const paisesPorIso2 = indicePerezoso(
  () => new Map(PAISES.map((p) => [p.iso2, p]))
)
const departamentosPorCodigo = indicePerezoso(
  () => new Map(DEPARTAMENTOS.map((d) => [d.codigo, d]))
)
const municipiosPorCodigo = indicePerezoso(
  () => new Map(MUNICIPIOS.map((m) => [m.codigo, m]))
)

const municipiosPorDepartamento = indicePerezoso(() =>
  agrupar(MUNICIPIOS, (m) => m.departamentoCodigo)
)
const municipiosPorGeometria = indicePerezoso(() =>
  agrupar(MUNICIPIOS, (m) => m.codigoGeometria)
)

function agrupar<T>(
  elementos: readonly T[],
  clave: (elemento: T) => string
): Map<string, T[]> {
  const grupos = new Map<string, T[]>()
  for (const elemento of elementos) {
    const k = clave(elemento)
    const grupo = grupos.get(k)
    if (grupo) grupo.push(elemento)
    else grupos.set(k, [elemento])
  }
  return grupos
}

export const listarPaises = (): readonly Pais[] => PAISES
export const listarDepartamentos = (): readonly Departamento[] => DEPARTAMENTOS
export const listarMunicipios = (): readonly Municipio[] => MUNICIPIOS

/** Búsqueda exacta por ISO 3166-1 alfa-2 en mayúsculas; para entradas libres usar `resolverPais`. */
export const obtenerPais = (iso2: string): Pais | undefined =>
  paisesPorIso2().get(iso2)

/** Búsqueda exacta por código DANE de dos dígitos; para entradas libres usar `resolverDepartamento`. */
export const obtenerDepartamento = (codigo: string): Departamento | undefined =>
  departamentosPorCodigo().get(codigo)

/** Búsqueda exacta por código DIVIPOLA de cinco dígitos; para entradas libres usar `resolverMunicipio`. */
export const obtenerMunicipio = (codigo: string): Municipio | undefined =>
  municipiosPorCodigo().get(codigo)

export const municipiosDeDepartamento = (
  codigoDepartamento: string
): readonly Municipio[] =>
  municipiosPorDepartamento().get(codigoDepartamento) ?? []

/**
 * Municipios que se dibujan con un polígono. Casi siempre es uno; el polígono de
 * Río Viejo (13600), por ejemplo, representa también a Norosí (13490).
 */
export const municipiosRepresentadosPor = (
  codigoGeometria: string
): readonly Municipio[] => municipiosPorGeometria().get(codigoGeometria) ?? []
