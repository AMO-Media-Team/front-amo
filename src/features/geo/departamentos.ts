/**
 * Búsqueda de departamentos apta para el cliente: importa solo el diccionario
 * de departamentos (9 KB). `@/lib/geo/catalogo` arrastra también municipios y
 * países (≈ 170 KB) y queda para el servidor.
 */
import { DEPARTAMENTOS } from "@/lib/geo/diccionarios/departamentos"
import type { Departamento } from "@/lib/geo/tipos"

const POR_CODIGO: ReadonlyMap<string, Departamento> = new Map(
  DEPARTAMENTOS.map((departamento) => [departamento.codigo, departamento])
)

export function departamentoPorCodigo(
  codigo: string | null | undefined
): Departamento | undefined {
  return codigo ? POR_CODIGO.get(codigo) : undefined
}

export function listarDepartamentosCliente(): readonly Departamento[] {
  return DEPARTAMENTOS
}
