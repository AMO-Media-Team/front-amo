import { normalizarNombreGeo } from "./normalizar"
import type { Municipio, TipoMunicipio } from "./tipos"

/**
 * Municipio serializado como tupla para que el diccionario generado pese la mitad:
 * [codigo, nombre, tipo, esCapital, lon, lat, codigoGeometria, oeste, sur, este, norte].
 */
export type FilaMunicipio = readonly [
  codigo: string,
  nombre: string,
  tipo: number,
  esCapital: number,
  lon: number,
  lat: number,
  codigoGeometria: string,
  oeste: number,
  sur: number,
  este: number,
  norte: number,
]

/** Orden de los índices de `tipo` en la tupla. */
export const TIPOS_MUNICIPIO: readonly TipoMunicipio[] = [
  "MUNICIPIO",
  "AREA_NO_MUNICIPALIZADA",
  "ISLA",
]

export function decodificarMunicipio(fila: FilaMunicipio): Municipio {
  const [
    codigo,
    nombre,
    tipo,
    esCapital,
    lon,
    lat,
    codigoGeometria,
    oeste,
    sur,
    este,
    norte,
  ] = fila
  return {
    codigo,
    departamentoCodigo: codigo.slice(0, 2),
    nombre,
    nombreNormalizado: normalizarNombreGeo(nombre),
    tipo: TIPOS_MUNICIPIO[tipo],
    esCapital: esCapital === 1,
    centroide: [lon, lat],
    codigoGeometria,
    bbox: [oeste, sur, este, norte],
  }
}
