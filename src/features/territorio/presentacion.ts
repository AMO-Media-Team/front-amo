/**
 * Conversión y orden del territorio para la interfaz (lógica pura): de las
 * filas de la BD a los tipos de la app, departamentos por nombre y municipios
 * con la capital primero.
 */
import type { DepartamentoActivo, MunicipioActivo } from "./tipos"

const LOCALE = "es-CO"

export interface FilaDepartamento {
  codigo: string
  nombre: string
  nombre_corto: string
  region: string
}

export interface FilaMunicipio {
  codigo: string
  nombre: string
  departamento_codigo: string
  es_capital: boolean
}

export function aDepartamento(fila: FilaDepartamento): DepartamentoActivo {
  return {
    // `char(2)`: PostgREST lo entrega sin relleno, pero no cuesta asegurarlo.
    codigo: fila.codigo.trim(),
    nombre: fila.nombre,
    nombreCorto: fila.nombre_corto,
    region: fila.region,
  }
}

export function aMunicipio(fila: FilaMunicipio): MunicipioActivo {
  return {
    codigo: fila.codigo.trim(),
    nombre: fila.nombre,
    departamentoCodigo: fila.departamento_codigo.trim(),
    esCapital: fila.es_capital,
  }
}

export function ordenarDepartamentos(
  departamentos: readonly DepartamentoActivo[]
): DepartamentoActivo[] {
  return [...departamentos].sort((a, b) =>
    a.nombreCorto.localeCompare(b.nombreCorto, LOCALE)
  )
}

/** La capital primero (es la que más se elige) y luego en orden alfabético. */
export function ordenarMunicipios(
  municipios: readonly MunicipioActivo[]
): MunicipioActivo[] {
  return [...municipios].sort(
    (a, b) =>
      Number(b.esCapital) - Number(a.esCapital) ||
      a.nombre.localeCompare(b.nombre, LOCALE)
  )
}
