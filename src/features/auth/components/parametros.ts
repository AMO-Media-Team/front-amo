/** Un parámetro de búsqueda repetido (`?a=1&a=2`) llega como arreglo: se usa el primero. */
export function primerValor(
  valor: string | string[] | undefined
): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor
}
