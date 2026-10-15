/**
 * Puntuación del menú de comandos. El filtro difuso por defecto de cmdk
 * acepta cualquier subsecuencia de letras ("bitac" encontraba "Mapa"); aquí
 * cada palabra buscada debe aparecer completa (sin tildes ni mayúsculas) y
 * pesa más si coincide con el título.
 */

const PESOS = {
  inicioTitulo: 1,
  titulo: 0.8,
  palabraClave: 0.5,
} as const

export function normalizarBusqueda(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es-CO")
    .trim()
}

function puntuarPalabra(
  palabra: string,
  titulo: string,
  palabrasClave: readonly string[]
): number {
  if (titulo.startsWith(palabra)) return PESOS.inicioTitulo
  if (titulo.includes(palabra)) return PESOS.titulo
  if (palabrasClave.some((clave) => clave.includes(palabra))) {
    return PESOS.palabraClave
  }
  return 0
}

/**
 * Firma del `filter` de cmdk: `valor` es el título y `palabrasClave` los
 * sinónimos (incluida la descripción). Devuelve 0 para ocultar el elemento.
 */
export function puntuarComando(
  valor: string,
  busqueda: string,
  palabrasClave: readonly string[] = []
): number {
  const palabras = normalizarBusqueda(busqueda).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return 1

  const titulo = normalizarBusqueda(valor)
  const claves = palabrasClave.map(normalizarBusqueda)

  let total = 0
  for (const palabra of palabras) {
    const puntaje = puntuarPalabra(palabra, titulo, claves)
    if (puntaje === 0) return 0
    total += puntaje
  }
  return total / palabras.length
}
